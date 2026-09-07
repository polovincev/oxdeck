export const kubernetesActions = [
  "pods",
  "logs",
  "describe",
  "manifest",
  "exec",
  "forward",
] as const;
export type KubernetesAction = (typeof kubernetesActions)[number];

export type KubernetesPod = {
  name: string;
  status: string;
  ready: number;
  total: number;
  restarts: number;
  healthy: boolean;
  containers: Array<{
    name: string;
    kind: "app" | "init" | "sidecar" | "ephemeral";
  }>;
};

export type KubernetesListResult<T> =
  { ok: true; items: T[] } | { ok: false; message: string };

export type KubernetesSettings = {
  context: string;
  namespaces: Record<string, string>;
  action: KubernetesAction;
  pod: string;
  container: string;
  wide: boolean;
  tail: string;
  since: string;
  logMode: "snapshot" | "follow" | "previous";
  format: "yaml" | "json";
  shell: "sh" | "bash";
  resource: "pod" | "service";
  service: string;
  localPort: string;
  remotePort: string;
};

export const defaultKubernetesSettings: KubernetesSettings = {
  context: "",
  namespaces: {},
  action: "pods",
  pod: "",
  container: "",
  wide: false,
  tail: "200",
  since: "",
  logMode: "snapshot",
  format: "yaml",
  shell: "sh",
  resource: "pod",
  service: "",
  localPort: "8080",
  remotePort: "80",
};

export function restoreKubernetesSettings(value: unknown): KubernetesSettings {
  const result = { ...defaultKubernetesSettings, namespaces: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }
  const saved = value as Record<string, unknown>;
  for (const key of [
    "context",
    "pod",
    "container",
    "tail",
    "since",
    "service",
    "localPort",
    "remotePort",
  ] as const) {
    if (typeof saved[key] === "string" && saved[key].length <= 1024) {
      result[key] = saved[key];
    }
  }
  if (kubernetesActions.includes(saved.action as KubernetesAction)) {
    result.action = saved.action as KubernetesAction;
  }
  result.wide = saved.wide === true;
  if (saved.logMode === "follow" || saved.logMode === "previous") {
    result.logMode = saved.logMode;
  }
  if (saved.format === "json") {
    result.format = "json";
  }
  if (saved.shell === "bash") {
    result.shell = "bash";
  }
  if (saved.resource === "service") {
    result.resource = "service";
  }
  if (
    saved.namespaces &&
    typeof saved.namespaces === "object" &&
    !Array.isArray(saved.namespaces)
  ) {
    result.namespaces = Object.fromEntries(
      Object.entries(saved.namespaces)
        .filter(
          ([key, namespace]) =>
            key.length <= 1024 &&
            typeof namespace === "string" &&
            namespace.length <= 63,
        )
        .slice(0, 1000),
    );
  }
  return result;
}

export function kubernetesNamespace(settings: KubernetesSettings) {
  return Object.hasOwn(settings.namespaces, settings.context)
    ? settings.namespaces[settings.context]
    : "default";
}

export function changeKubernetesScope(
  settings: KubernetesSettings,
  context: string,
  namespace?: string,
): KubernetesSettings {
  return {
    ...settings,
    context,
    pod: "",
    container: "",
    service: "",
    namespaces:
      namespace === undefined
        ? settings.namespaces
        : { ...settings.namespaces, [context]: namespace },
  };
}

// POSIX quoting keeps context names literal when pasted into macOS shells.
function quoteArgument(value: string) {
  return /^[a-zA-Z0-9_./:=@-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function buildKubernetesCommand(settings: KubernetesSettings): {
  command: string;
  error: string;
} {
  const fail = (error: string) => ({ command: "", error });
  const namespace = kubernetesNamespace(settings);
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
  const validName = (name: string) =>
    name.length <= 253 &&
    name.split(".").every((part) => part.length <= 63 && dnsLabel.test(part));
  if (!settings.context || /[\r\n\t\0]/.test(settings.context)) {
    return fail("Выберите контекст");
  }
  if (!dnsLabel.test(namespace) || namespace.length > 63) {
    return fail("Введите namespace: до 63 строчных букв, цифр и дефисов");
  }
  const needsPod =
    settings.action !== "pods" &&
    !(settings.action === "forward" && settings.resource === "service");
  if (needsPod && !validName(settings.pod)) {
    return fail("Введите корректное имя pod");
  }
  const hasContainer = settings.action === "logs" || settings.action === "exec";
  if (
    hasContainer &&
    settings.container &&
    (!dnsLabel.test(settings.container) || settings.container.length > 63)
  ) {
    return fail("Введите корректное имя контейнера или оставьте поле пустым");
  }
  const args = [
    "kubectl",
    `--context=${settings.context}`,
    `--namespace=${namespace}`,
  ];
  switch (settings.action) {
    case "pods":
      args.push("get", "pods");
      if (settings.wide) {
        args.push("--output=wide");
      }
      break;
    case "logs":
      if (
        !/^\d+$/.test(settings.tail) ||
        !Number.isSafeInteger(Number(settings.tail))
      ) {
        return fail("Число строк должно быть целым неотрицательным числом");
      }
      if (
        settings.since &&
        !/^(?:\d+(?:\.\d+)?(?:h|m|s))+$/.test(settings.since)
      ) {
        return fail("Период: например 30s, 15m или 1h30m");
      }
      args.push("logs", settings.pod, `--tail=${settings.tail}`);
      if (settings.since) {
        args.push(`--since=${settings.since}`);
      }
      if (settings.logMode !== "snapshot") {
        args.push(settings.logMode === "follow" ? "--follow" : "--previous");
      }
      break;
    case "describe":
      args.push("describe", "pod", settings.pod);
      break;
    case "manifest":
      args.push("get", "pod", settings.pod, `--output=${settings.format}`);
      break;
    case "exec":
      args.push("exec", settings.pod, "-it");
      break;
    case "forward":
      if (settings.resource === "service" && !validName(settings.service)) {
        return fail("Введите корректное имя service");
      }
      if (
        ![settings.localPort, settings.remotePort].every(
          (port) =>
            /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535,
        )
      ) {
        return fail("Порты должны быть целыми числами от 1 до 65535");
      }
      args.push(
        "port-forward",
        `${settings.resource}/${settings.resource === "pod" ? settings.pod : settings.service}`,
        `${settings.localPort}:${settings.remotePort}`,
      );
      break;
  }
  if (hasContainer && settings.container) {
    args.push(`--container=${settings.container}`);
  }
  if (settings.action === "exec") {
    args.push("--", settings.shell);
  }
  return { command: args.map(quoteArgument).join(" "), error: "" };
}
