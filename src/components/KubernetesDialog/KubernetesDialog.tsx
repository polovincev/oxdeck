import { useEffect, useRef, useState } from "react";
import {
  buildKubernetesCommand,
  changeKubernetesScope,
  kubernetesNamespace,
  type KubernetesAction,
  type KubernetesSettings,
} from "../../../shared/kubernetes";
import {
  kubernetesActionOptions,
  kubernetesLabel,
  kubernetesLogModes,
  kubernetesFormats,
  kubernetesShells,
  kubernetesResources,
  kubernetesLinePresets,
  kubernetesPeriodPresets,
  kubernetesContainerKinds,
  kubernetesParameterLabels,
  kubernetesSections,
} from "../../catalog";
import { Button } from "../../ui/Button/Button";
import {
  KubernetesPage,
  type KubernetesPageOption,
} from "../KubernetesPage/KubernetesPage";
import { useKubernetesList } from "./useKubernetesList";
import "./KubernetesDialog.css";

type Parameter = keyof typeof kubernetesParameterLabels;
type Section = "contexts" | "namespaces" | "pods" | "actions";
type Step = Section | "parameters" | Parameter;
type Manual = { target: "namespaces" | "pods" | Parameter; value: string };

async function loadContexts() {
  const result = await window.oxdeck.listKubernetesContexts();
  return result.ok ? { ok: true as const, items: result.contexts } : result;
}
const loadNamespaces = (context: string) =>
  window.oxdeck.listKubernetesNamespaces(context);
const loadPods = (context: string, namespace: string) =>
  window.oxdeck.listKubernetesPods(context, namespace);
const optionsFor = (items: string[]) => items.map((id) => ({ id, name: id }));

export function KubernetesDialog({
  settings,
  onChange,
  onClose,
}: {
  settings: KubernetesSettings;
  onChange: (settings: KubernetesSettings) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>(
    settings.context ? "pods" : "contexts",
  );
  const [manual, setManual] = useState<Manual | null>(null);
  const [manualPod, setManualPod] = useState(false);
  const [feedback, setFeedback] = useState<{
    command: string;
    message: string;
  } | null>(null);
  const [copying, setCopying] = useState(false);
  const contexts = useKubernetesList(loadContexts, "", "", true, true);
  const contextAvailable = contexts.items.includes(settings.context);
  const namespace = kubernetesNamespace(settings);
  const validNamespace =
    namespace.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(namespace);
  const namespaces = useKubernetesList(
    loadNamespaces,
    settings.context,
    "",
    contextAvailable,
  );
  const pods = useKubernetesList(
    loadPods,
    settings.context,
    namespace,
    contextAvailable && validNamespace,
  );
  const selectedPod = pods.items.find((pod) => pod.name === settings.pod);
  const actionName =
    kubernetesActionOptions.find(({ id }) => id === settings.action)?.name ??
    "Действие";
  const section: Section =
    step === "contexts" || step === "namespaces" || step === "pods"
      ? step
      : "actions";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function go(next: Step) {
    setManual(null);
    setStep(next);
  }
  function change<K extends keyof KubernetesSettings>(
    key: K,
    value: KubernetesSettings[K],
  ) {
    setFeedback(null);
    onChange({ ...settings, [key]: value });
  }
  function chooseContext(context: string) {
    if (context !== settings.context) {
      setFeedback(null);
      setManualPod(false);
      onChange(changeKubernetesScope(settings, context));
    }
    go("namespaces");
  }
  function chooseNamespace(name: string) {
    if (name !== namespace) {
      setFeedback(null);
      setManualPod(false);
      onChange(changeKubernetesScope(settings, settings.context, name));
    }
    go("pods");
  }
  function choosePod(name: string, fromInput = false) {
    setFeedback(null);
    setManualPod(fromInput);
    onChange({
      ...settings,
      pod: name,
      container: "",
      action: settings.action === "pods" ? "logs" : settings.action,
    });
    go("actions");
  }
  function chooseAction(id: string) {
    change("action", id as KubernetesAction);
    go(id === "describe" ? "actions" : "parameters");
  }
  function chooseParameter(id: string) {
    const target = id as Parameter;
    go(target);
    if (
      target === "service" ||
      target === "localPort" ||
      target === "remotePort"
    ) {
      setManual({ target, value: settings[target] });
    }
  }
  function setParameter(target: Parameter, value: string) {
    if (target === "wide") {
      change("wide", value === "wide");
    } else {
      change(target, value);
    }
    go("parameters");
  }

  const needsPod =
    settings.action !== "pods" &&
    !(settings.action === "forward" && settings.resource === "service");
  const built = buildKubernetesCommand(settings);
  const error = !contextAvailable
    ? "Выберите доступный кластер"
    : needsPod && !manualPod && !selectedPod
      ? pods.loading
        ? "Загружаем поды…"
        : "Выберите pod или введите имя вручную"
      : built.error;
  const command = error ? "" : built.command;
  async function copy() {
    setCopying(true);
    try {
      const result = await window.oxdeck.copyKubernetesCommand(settings);
      setFeedback({
        command,
        message: result.ok ? "Команда скопирована" : result.message,
      });
    } catch {
      setFeedback({
        command,
        message: "Не удалось скопировать. Выделите команду и нажмите ⌘C.",
      });
    } finally {
      setCopying(false);
    }
  }

  const parameters = (
    {
      logs: ["container", "logMode", "tail", "since"],
      exec: ["container", "shell"],
      forward: [
        "resource",
        ...(settings.resource === "service" ? ["service" as const] : []),
        "localPort",
        "remotePort",
      ],
      manifest: ["format"],
      pods: ["wide"],
      describe: [],
    } satisfies Record<KubernetesAction, Parameter[]>
  )[settings.action];
  const groups: Partial<
    Record<Parameter, ReadonlyArray<KubernetesPageOption>>
  > = {
    container: [
      { id: "", name: "По умолчанию" },
      ...(selectedPod?.containers.map((container) => ({
        id: container.name,
        name: container.name,
        detail: kubernetesContainerKinds[container.kind],
      })) ?? []),
    ],
    logMode: kubernetesLogModes,
    tail: kubernetesLinePresets,
    since: kubernetesPeriodPresets,
    format: kubernetesFormats,
    shell: kubernetesShells,
    resource: kubernetesResources,
    wide: [
      { id: "normal", name: "Обычный" },
      { id: "wide", name: "Расширенный" },
    ],
  };
  function parameterValue(key: Parameter) {
    const raw =
      key === "wide" ? (settings.wide ? "wide" : "normal") : settings[key];
    return (
      groups[key]?.find(({ id }) => id === raw)?.name || raw || "Не задано"
    );
  }

  let label: string;
  let options: ReadonlyArray<KubernetesPageOption>;
  let value = "";
  let message = "";
  let refresh: (() => void) | undefined;
  let loading = false;
  let select: (id: string) => void;
  let manualTarget: Manual["target"] | undefined;
  if (step === "contexts") {
    label = "Контексты";
    options = optionsFor(contexts.items);
    value = settings.context;
    select = chooseContext;
    refresh = contexts.refresh;
    loading = contexts.loading;
    message = contexts.loading
      ? "Читаем подключения…"
      : contexts.error ||
        (!options.length ? "В kubeconfig нет контекстов" : "");
  } else if (step === "namespaces") {
    label = "Namespace";
    options = optionsFor(namespaces.items);
    value = namespace;
    select = chooseNamespace;
    refresh = namespaces.refresh;
    loading = namespaces.loading;
    manualTarget = "namespaces";
    message = !contextAvailable
      ? "Сначала выберите кластер"
      : namespaces.loading
        ? "Загружаем namespace…"
        : namespaces.error ||
          (!options.length
            ? "Namespace не найдены. Можно ввести имя вручную."
            : "");
  } else if (step === "pods") {
    label = "Поды";
    value = manualPod ? "" : settings.pod;
    select = choosePod;
    manualTarget = "pods";
    options = pods.items.map((pod) => ({
      id: pod.name,
      name: pod.name,
      detail: `${pod.status} · Готово ${pod.ready}/${pod.total} · Рестарты ${pod.restarts}`,
      healthy: pod.healthy,
    }));
    refresh = pods.refresh;
    loading = pods.loading;
    message = !contextAvailable
      ? "Сначала выберите кластер"
      : !validNamespace
        ? "Выберите namespace"
        : pods.loading
          ? "Загружаем поды…"
          : pods.error ||
            (!options.length ? `В namespace ${namespace} нет подов` : "");
  } else if (step === "actions") {
    label = "Действия";
    options = kubernetesActionOptions;
    value = settings.action;
    select = chooseAction;
  } else if (step === "parameters") {
    label = `Параметры: ${actionName}`;
    options = parameters.map((id) => ({
      id,
      name: kubernetesParameterLabels[id],
      detail: parameterValue(id),
    }));
    select = chooseParameter;
    message = !options.length ? "Команда готова. Скопируйте её внизу." : "";
  } else {
    label = kubernetesParameterLabels[step];
    options = groups[step] ?? [];
    value =
      step === "wide" ? (settings.wide ? "wide" : "normal") : settings[step];
    select = (id) => setParameter(step, id);
    if (
      [
        "container",
        "tail",
        "since",
        "service",
        "localPort",
        "remotePort",
      ].includes(step)
    ) {
      manualTarget = step;
    }
  }
  const isParameter = section === "actions" && step !== "actions";
  const manualLabel =
    manual?.target === "namespaces"
      ? "Namespace"
      : manual?.target === "pods"
        ? "Имя pod"
        : manual
          ? kubernetesParameterLabels[manual.target]
          : "";
  const numeric =
    manual && ["tail", "localPort", "remotePort"].includes(manual.target);
  const manualPattern =
    manual?.target === "namespaces" || manual?.target === "container"
      ? "[a-z0-9]([a-z0-9\\-]*[a-z0-9])?"
      : manual?.target === "pods" || manual?.target === "service"
        ? "[a-z0-9]([a-z0-9.\\-]*[a-z0-9])?"
        : manual?.target === "since"
          ? "([0-9]+(\\.[0-9]+)?[hms])+"
          : undefined;

  return (
    <dialog
      className="kubernetes-screen"
      ref={dialog}
      aria-labelledby="kubernetes-screen-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="kubernetes-screen-header">
        <Button type="button" onClick={onClose}>
          ← Назад
        </Button>
        <h1 id="kubernetes-screen-title">{kubernetesLabel}</h1>
        <p title={`${settings.context} / ${namespace} / ${settings.pod}`}>
          {settings.context || "Кластер не выбран"} / {namespace}
          {settings.pod ? ` / ${settings.pod}` : ""}
        </p>
      </header>
      <nav className="kubernetes-screen-tabs" aria-label="Разделы Kubernetes">
        {kubernetesSections.map(({ id, name }, index) => (
          <Button
            key={id}
            type="button"
            aria-current={section === id ? "step" : undefined}
            onClick={() => go(id)}
          >
            <span>{index + 1}</span>
            {name}
          </Button>
        ))}
      </nav>
      {manual ? (
        <form
          className="kubernetes-manual-page"
          onSubmit={(event) => {
            event.preventDefault();
            const next = manual.value.trim();
            if (manual.target === "namespaces") {
              chooseNamespace(next);
            } else if (manual.target === "pods") {
              choosePod(next, true);
            } else {
              setParameter(manual.target, next);
            }
          }}
        >
          <label>
            {manualLabel}
            <input
              autoFocus
              aria-label={manualLabel}
              type={numeric ? "number" : "text"}
              inputMode={numeric ? "numeric" : "text"}
              min={manual.target === "tail" ? 0 : 1}
              max={manual.target === "tail" ? Number.MAX_SAFE_INTEGER : 65535}
              step="1"
              maxLength={
                manual.target === "namespaces" || manual.target === "container"
                  ? 63
                  : 253
              }
              pattern={manualPattern}
              required={
                manual.target !== "container" && manual.target !== "since"
              }
              spellCheck={false}
              value={manual.value}
              onChange={(event) =>
                setManual({ ...manual, value: event.target.value })
              }
            />
          </label>
          <div>
            <Button
              type="button"
              onClick={() => go(isParameter ? "parameters" : step)}
            >
              Отмена
            </Button>
            <Button variant="primary" type="submit">
              Применить
            </Button>
          </div>
        </form>
      ) : (
        <KubernetesPage
          key={`${step}:${settings.context}:${namespace}`}
          label={label}
          options={options}
          value={value}
          onSelect={select}
          message={message}
          searchable={section !== "actions" || step === "container"}
          tools={
            <>
              {isParameter && (
                <Button
                  type="button"
                  onClick={() =>
                    go(step === "parameters" ? "actions" : "parameters")
                  }
                >
                  ← {step === "parameters" ? "Действия" : "Параметры"}
                </Button>
              )}
              {refresh && (
                <Button
                  type="button"
                  disabled={
                    loading || (step !== "contexts" && !contextAvailable)
                  }
                  title={
                    step === "contexts"
                      ? "Перечитать подключения из kubeconfig"
                      : `Обновить ${label}`
                  }
                  aria-label={
                    step === "contexts"
                      ? "Перечитать подключения"
                      : `Обновить ${label}`
                  }
                  onClick={refresh}
                >
                  ↻
                </Button>
              )}
              {manualTarget && (
                <Button
                  type="button"
                  onClick={() => {
                    const target = manualTarget;
                    setManual({
                      target,
                      value:
                        target === "namespaces"
                          ? namespace
                          : target === "pods"
                            ? settings.pod
                            : String(settings[target]),
                    });
                  }}
                >
                  Ввести
                </Button>
              )}
            </>
          }
        />
      )}
      <footer className="kubernetes-screen-command">
        <input
          aria-label="Готовая команда"
          readOnly
          value={command}
          placeholder="Здесь появится готовая команда"
          spellCheck={false}
          onFocus={(event) => event.target.select()}
        />
        <Button
          variant="primary"
          type="button"
          disabled={!command || copying}
          onClick={() => void copy()}
        >
          Копировать
        </Button>
        <p role="status" title={error}>
          {feedback?.command === command
            ? feedback.message
            : error || "Команда готова для запуска в терминале"}
        </p>
      </footer>
    </dialog>
  );
}
