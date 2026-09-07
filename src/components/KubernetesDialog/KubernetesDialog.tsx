import { useEffect, useRef, useState } from "react";
import {
  buildKubernetesCommand,
  changeKubernetesScope,
  kubernetesNamespace,
  type KubernetesSettings,
} from "../../../shared/kubernetes";
import {
  kubernetesActionOptions,
  kubernetesLabel,
  kubernetesLogModes,
} from "../../catalog";
import { Button } from "../../ui/Button/Button";
import "../../ui/Dialog/Dialog.css";
import "./KubernetesDialog.css";

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
  const [contexts, setContexts] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void window.oxdeck
      .listKubernetesContexts()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setContexts(result.ok ? result.contexts : []);
        setLoadError(result.ok ? "" : result.message);
      })
      .catch(() => {
        if (!cancelled) {
          setContexts([]);
          setLoadError(
            "Не удалось загрузить контексты. Попробуйте обновить список.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  function change<K extends keyof KubernetesSettings>(
    key: K,
    value: KubernetesSettings[K],
  ) {
    setFeedback("");
    onChange({ ...settings, [key]: value });
  }
  function changeScope(context: string, namespace?: string) {
    setFeedback("");
    onChange(changeKubernetesScope(settings, context, namespace));
  }
  const built = buildKubernetesCommand(settings);
  const contextAvailable = contexts?.includes(settings.context);
  const command = contextAvailable ? built.command : "";
  const error =
    contexts === null
      ? "Загрузка контекстов…"
      : loadError ||
        (!contexts.length
          ? "В kubeconfig нет контекстов. Добавьте конфигурацию кластера и обновите список."
          : !contextAvailable
            ? "Выберите доступный контекст из kubeconfig"
            : built.error);
  const needsPod =
    settings.action !== "pods" &&
    !(settings.action === "forward" && settings.resource === "service");

  async function copy() {
    setCopying(true);
    try {
      const result = await window.oxdeck.copyKubernetesCommand(settings);
      setFeedback(result.ok ? "Команда скопирована" : result.message);
    } catch {
      setFeedback(
        "Не удалось скопировать команду. Выделите её в предпросмотре и нажмите ⌘C.",
      );
    } finally {
      setCopying(false);
    }
  }

  return (
    <dialog
      className="dialog kubernetes-dialog"
      ref={dialog}
      aria-labelledby="kubernetes-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="kubernetes-title">{kubernetesLabel}</h2>
        <Button
          type="button"
          aria-label="Закрыть конструктор"
          onClick={onClose}
        >
          ×
        </Button>
      </header>
      <p className="kubernetes-hint">
        Соберите команду и скопируйте в терминал.
      </p>
      <div className="kubernetes-fields">
        <label>
          Контекст
          <select
            autoFocus
            value={settings.context}
            onChange={(event) => changeScope(event.target.value)}
            disabled={contexts === null}
          >
            <option value="">Выберите контекст</option>
            {settings.context && !contextAvailable && (
              <option value={settings.context} disabled>
                {settings.context} — недоступен
              </option>
            )}
            {contexts?.map((context) => (
              <option key={context} value={context}>
                {context}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          disabled={contexts === null}
          onClick={() => {
            setContexts(null);
            setLoadError("");
            setFeedback("");
            setRevision(revision + 1);
          }}
        >
          Обновить контексты
        </Button>
        <label>
          Namespace
          <input
            value={kubernetesNamespace(settings)}
            maxLength={63}
            spellCheck={false}
            onChange={(event) =>
              changeScope(settings.context, event.target.value)
            }
          />
        </label>
        <label>
          Действие
          <select
            value={settings.action}
            onChange={(event) =>
              change(
                "action",
                event.target.value as KubernetesSettings["action"],
              )
            }
          >
            {kubernetesActionOptions.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {settings.action === "forward" && (
          <label>
            Ресурс
            <select
              value={settings.resource}
              onChange={(event) =>
                change(
                  "resource",
                  event.target.value as KubernetesSettings["resource"],
                )
              }
            >
              <option value="pod">Pod</option>
              <option value="service">Service</option>
            </select>
          </label>
        )}
        {needsPod && (
          <label>
            Pod
            <input
              value={settings.pod}
              maxLength={253}
              spellCheck={false}
              placeholder="api-7d8f9"
              onChange={(event) => {
                setFeedback("");
                onChange({
                  ...settings,
                  pod: event.target.value,
                  container: "",
                });
              }}
            />
          </label>
        )}
        {settings.action === "forward" && settings.resource === "service" && (
          <label>
            Service
            <input
              value={settings.service}
              maxLength={253}
              spellCheck={false}
              placeholder="api"
              onChange={(event) => change("service", event.target.value)}
            />
          </label>
        )}
        {(settings.action === "logs" || settings.action === "exec") && (
          <label>
            Контейнер (необязательно)
            <input
              value={settings.container}
              maxLength={63}
              spellCheck={false}
              placeholder="По умолчанию"
              onChange={(event) => change("container", event.target.value)}
            />
          </label>
        )}
        {settings.action === "pods" && (
          <label className="kubernetes-check">
            <input
              type="checkbox"
              checked={settings.wide}
              onChange={(event) => change("wide", event.target.checked)}
            />
            Расширенный список
          </label>
        )}
        {settings.action === "logs" && (
          <>
            <label>
              Режим логов
              <select
                value={settings.logMode}
                onChange={(event) =>
                  change(
                    "logMode",
                    event.target.value as KubernetesSettings["logMode"],
                  )
                }
              >
                {kubernetesLogModes.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Последние N строк
              <input
                type="number"
                min="0"
                step="1"
                value={settings.tail}
                onChange={(event) => change("tail", event.target.value)}
              />
            </label>
            <label>
              За период (необязательно)
              <input
                value={settings.since}
                maxLength={64}
                placeholder="15m или 1h30m"
                onChange={(event) => change("since", event.target.value)}
              />
            </label>
          </>
        )}
        {settings.action === "manifest" && (
          <label>
            Формат
            <select
              value={settings.format}
              onChange={(event) =>
                change(
                  "format",
                  event.target.value as KubernetesSettings["format"],
                )
              }
            >
              <option value="yaml">YAML</option>
              <option value="json">JSON</option>
            </select>
          </label>
        )}
        {settings.action === "exec" && (
          <label>
            Оболочка
            <select
              value={settings.shell}
              onChange={(event) =>
                change(
                  "shell",
                  event.target.value as KubernetesSettings["shell"],
                )
              }
            >
              <option value="sh">sh</option>
              <option value="bash">bash</option>
            </select>
          </label>
        )}
        {settings.action === "forward" && (
          <>
            <label>
              Локальный порт
              <input
                type="number"
                min="1"
                max="65535"
                step="1"
                value={settings.localPort}
                onChange={(event) => change("localPort", event.target.value)}
              />
            </label>
            <label>
              Порт назначения
              <input
                type="number"
                min="1"
                max="65535"
                step="1"
                value={settings.remotePort}
                onChange={(event) => change("remotePort", event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <label className="kubernetes-preview">
        Команда
        <textarea
          readOnly
          value={command}
          rows={4}
          spellCheck={false}
          placeholder="Заполните поля для предпросмотра"
        />
      </label>
      <p className="kubernetes-feedback" role="status">
        {feedback || error || "Команда готова к копированию"}
      </p>
      <footer>
        <Button
          type="button"
          variant="primary"
          disabled={!command || copying}
          onClick={() => void copy()}
        >
          Копировать команду
        </Button>
      </footer>
    </dialog>
  );
}
