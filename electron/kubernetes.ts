import { execFile } from "node:child_process";
import { constants, promises as files } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  KubernetesListResult,
  KubernetesPod,
} from "../shared/kubernetes.js";

const run = promisify(execFile);

async function findKubectl() {
  const directories = [
    ...new Set([
      ...(process.env.PATH ?? "").split(path.delimiter),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
    ]),
  ].filter((directory) => path.isAbsolute(directory));
  for (const directory of directories) {
    const candidate = path.join(directory, "kubectl");
    try {
      await files.access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // GUI apps may not inherit the terminal PATH; try standard install paths too.
    }
  }
  throw new Error(
    "kubectl не найден. Установите его в PATH, /opt/homebrew/bin или /usr/local/bin.",
  );
}

export async function listKubernetesContexts() {
  try {
    const executable = await findKubectl();
    // Fixed local config command only: no shell, API requests or credential plugins.
    const { stdout } = await run(
      executable,
      ["config", "get-contexts", "--output=name"],
      {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      },
    );
    const contexts = [...new Set(stdout.split(/\r?\n/).filter(Boolean))].sort();
    return { ok: true as const, contexts };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error && error.message.startsWith("kubectl не найден")
          ? error.message
          : "Не удалось прочитать контексты. Проверьте kubeconfig и KUBECONFIG, затем обновите список.",
    };
  }
}

export function kubernetesReadArgs(
  resource: "namespaces" | "pods",
  context: unknown,
  namespace?: unknown,
) {
  if (
    typeof context !== "string" ||
    !context ||
    context.length > 1024 ||
    /[\r\n\t\0]/.test(context)
  ) {
    throw new Error("Выберите корректный контекст");
  }
  const args = [
    `--context=${context}`,
    "--request-timeout=10s",
    "get",
    resource,
    "--output=json",
  ];
  if (resource === "pods") {
    if (
      typeof namespace !== "string" ||
      namespace.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(namespace)
    ) {
      throw new Error("Введите корректный namespace");
    }
    args.push(`--namespace=${namespace}`);
  }
  return args;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.slice(0, 1024) : "";
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function listItems(value: unknown) {
  const items = record(value).items;
  if (!Array.isArray(items)) {
    throw new Error("Кластер вернул некорректный список ресурсов");
  }
  return items.map(record);
}

export function parseKubernetesNamespaces(value: unknown): string[] {
  return listItems(value)
    .map((item) => text(record(item.metadata).name))
    .filter(Boolean)
    .sort();
}

export function parseKubernetesPods(value: unknown): KubernetesPod[] {
  return listItems(value)
    .map((item) => {
      const metadata = record(item.metadata);
      const spec = record(item.spec);
      const status = record(item.status);
      const appContainers = records(spec.containers);
      const initContainers = records(spec.initContainers);
      const sidecars = initContainers.filter(
        (container) => container.restartPolicy === "Always",
      );
      const regularStatuses = records(status.containerStatuses);
      const initStatuses = records(status.initContainerStatuses);
      const activeStatuses = [
        ...regularStatuses,
        ...initStatuses.filter((container) =>
          sidecars.some((sidecar) => sidecar.name === container.name),
        ),
      ];
      const states = [...initStatuses, ...regularStatuses];
      const waiting = states
        .map((container) =>
          text(record(record(container.state).waiting).reason),
        )
        .find(Boolean);
      const failure = states
        .map((container) => record(record(container.state).terminated))
        .find(
          (terminated) =>
            typeof terminated.exitCode === "number" &&
            terminated.exitCode !== 0,
        );
      const phase = text(status.phase) || "Unknown";
      const deleting = Boolean(metadata.deletionTimestamp);
      const displayStatus = deleting
        ? "Terminating"
        : text(status.reason) ||
          waiting ||
          (failure ? text(failure.reason) || "Error" : phase);
      const ready = activeStatuses.filter(
        (container) => container.ready === true,
      ).length;
      const total = appContainers.length + sidecars.length;
      return {
        name: text(metadata.name),
        status: displayStatus,
        ready,
        total,
        restarts: states.reduce(
          (sum, container) =>
            sum +
            (typeof container.restartCount === "number" &&
            Number.isSafeInteger(container.restartCount) &&
            container.restartCount > 0
              ? container.restartCount
              : 0),
          0,
        ),
        healthy:
          !deleting &&
          phase === "Running" &&
          !waiting &&
          !failure &&
          records(status.conditions).some(
            (condition) =>
              condition.type === "Ready" && condition.status === "True",
          ),
        containers: [
          ...appContainers.map((container) => ({
            name: text(container.name),
            kind: "app" as const,
          })),
          ...initContainers.map((container) => ({
            name: text(container.name),
            kind:
              container.restartPolicy === "Always"
                ? ("sidecar" as const)
                : ("init" as const),
          })),
          ...records(spec.ephemeralContainers).map((container) => ({
            name: text(container.name),
            kind: "ephemeral" as const,
          })),
        ].filter((container) => container.name),
      };
    })
    .filter((pod) => pod.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function kubernetesReadError(error: unknown) {
  const details = record(error);
  const message = `${text(details.stderr)} ${error instanceof Error ? error.message : ""}`;
  if (/forbidden/i.test(message)) {
    return "Нет прав на просмотр ресурсов (Forbidden). Проверьте доступы к выбранному кластеру и namespace.";
  }
  if (
    /unauthorized|logged in|credentials|exec plugin|getting credentials/i.test(
      message,
    )
  ) {
    return "Требуется вход в кластер. Обновите авторизацию в терминале и повторите запрос.";
  }
  if (details.killed || /timeout|timed out|deadline exceeded/i.test(message)) {
    return "Кластер не ответил вовремя. Проверьте сеть, VPN и авторизацию, затем повторите запрос.";
  }
  if (/notfound|not found/i.test(message)) {
    return "Namespace или контекст не найден. Проверьте выбранное окружение.";
  }
  if (/certificate|x509/i.test(message)) {
    return "Не удалось проверить сертификат кластера. Проверьте kubeconfig и сертификаты.";
  }
  if (
    error instanceof Error &&
    !Object.hasOwn(details, "stderr") &&
    !Object.hasOwn(details, "code")
  ) {
    return error instanceof SyntaxError
      ? "Кластер вернул некорректный JSON"
      : error.message;
  }
  // Do not return raw stderr: authentication plugins may include credentials in it.
  return "Не удалось подключиться к кластеру. Проверьте сеть, VPN и kubeconfig, затем повторите запрос.";
}

async function readResources<T>(
  resource: "namespaces" | "pods",
  context: unknown,
  namespace: unknown,
  parse: (value: unknown) => T[],
): Promise<KubernetesListResult<T>> {
  try {
    const args = kubernetesReadArgs(resource, context, namespace);
    const executable = await findKubectl();
    const { stdout } = await run(executable, args, {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, items: parse(JSON.parse(stdout) as unknown) };
  } catch (error) {
    return { ok: false, message: kubernetesReadError(error) };
  }
}

export const listKubernetesNamespaces = (context: unknown) =>
  readResources("namespaces", context, undefined, parseKubernetesNamespaces);
export const listKubernetesPods = (context: unknown, namespace: unknown) =>
  readResources("pods", context, namespace, parseKubernetesPods);
