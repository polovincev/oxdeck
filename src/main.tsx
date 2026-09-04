import { StrictMode, useEffect, useRef, useState, type DragEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type ApplicationId = "chrome" | "finder" | "terminal" | "vscode";

type Application = {
  id: ApplicationId;
  name: string;
};

type FileShelfItem = {
  path: string;
  name: string;
  exists: boolean;
  isDirectory: boolean;
  icon: string | null;
};

type SystemStats = {
  cpu: number | null;
  memory: number | null;
  batteryTemperature: number | null;
};

const applications: Application[] = [
  { id: "chrome", name: "Chrome" },
  { id: "finder", name: "Finder" },
  { id: "terminal", name: "Terminal" },
  { id: "vscode", name: "VS Code" },
];

const windowCommands: Array<{
  id: OxDeckWindowCommand;
  name: string;
}> = [
  { id: "left", name: "Левая" },
  { id: "right", name: "Правая" },
  { id: "topRight", name: "Справа сверху" },
  { id: "bottomRight", name: "Справа снизу" },
  { id: "maximize", name: "Развернуть" },
];

type FileCardProps = {
  item: FileShelfItem;
  onRemove: (item: FileShelfItem) => void;
  onReveal: (item: FileShelfItem) => void;
};

function FileCard({ item, onRemove, onReveal }: FileCardProps) {
  function startDrag(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    window.oxdeck.startFileDrag(item.path);
  }

  return (
    <article
      className={`shelf-item${item.exists ? "" : " missing"}`}
      draggable={item.exists}
      onDragStart={startDrag}
      title={item.exists ? item.path : `${item.path}\nФайл недоступен`}
    >
      <button
        className="file-open"
        type="button"
        aria-label={`Показать ${item.name} в Finder`}
        onClick={() => onReveal(item)}
      >
        {item.icon ? (
          <img src={item.icon} alt="" />
        ) : (
          <span className="file-fallback">
            {item.isDirectory ? "▰" : "▧"}
          </span>
        )}
        <span>{item.name}</span>
      </button>
      <button
        className="file-remove"
        type="button"
        aria-label={`Убрать ${item.name} с полки`}
        onClick={() => onRemove(item)}
      >
        ×
      </button>
    </article>
  );
}

function Dashboard() {
  const [animation, setAnimation] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [files, setFiles] = useState<FileShelfItem[]>([]);
  const [version, setVersion] = useState("0.0.0");
  const [settingsState, setSettingsState] =
    useState<OxDeckSettingsState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<OxDeckMode>("compact");
  const [draftDisplayId, setDraftDisplayId] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [activeWindowCommand, setActiveWindowCommand] =
    useState<OxDeckWindowCommand | null>(null);
  const [windowCommandPending, setWindowCommandPending] = useState(false);
  const [status, setStatus] = useState(
    "Наведите курсор на верхний центр экрана",
  );
  const [stats, setStats] = useState<SystemStats>({
    cpu: null,
    memory: null,
    batteryTemperature: null,
  });
  const dragDepth = useRef(0);

  async function refreshFiles() {
    setFiles(await window.oxdeck.listFiles());
  }

  useEffect(() => {
    refreshFiles();
    window.oxdeck.getVersion().then(setVersion);
    window.oxdeck.getSettings().then(updateSettingsState);

    const unsubscribeShow = window.oxdeck.onShow(() => {
      setAnimation("opening");
      refreshFiles();
    });
    const unsubscribeHide = window.oxdeck.onHide(() => {
      setAnimation("closing");
    });
    const unsubscribeStats = window.oxdeck.onStats(setStats);
    const unsubscribeSettings = window.oxdeck.onSettingsChange(
      updateSettingsState,
    );

    return () => {
      unsubscribeShow();
      unsubscribeHide();
      unsubscribeStats();
      unsubscribeSettings();
    };
  }, []);

  function updateSettingsState(next: OxDeckSettingsState) {
    setSettingsState(next);
    if (next.settings.mode === "workspace") {
      setStatus(
        next.targetAvailable
          ? "Рабочая панель закреплена на выбранном мониторе"
          : "Выбранный монитор не подключён — временно используется компактный режим",
      );
    }
  }

  async function openSettings() {
    if (!settingsState) return;
    await window.oxdeck.focusSettings();
    setDraftMode(settingsState.settings.mode);
    setDraftDisplayId(
      settingsState.settings.display?.id ??
        settingsState.displays[0]?.id ??
        null,
    );
    setSettingsError("");
    setSettingsOpen(true);
  }

  function closeSettings() {
    setSettingsOpen(false);
    window.oxdeck.releaseFocus();
  }

  async function saveSettings() {
    const result = await window.oxdeck.saveSettings({
      mode: draftMode,
      displayId: draftDisplayId,
    });

    if (!result.ok) {
      setSettingsError(result.message);
      return;
    }

    updateSettingsState(result.state);
    closeSettings();
    setStatus(
      result.state.activeMode === "workspace"
        ? "Рабочая панель закреплена на выбранном мониторе"
        : "Наведите курсор на верхний центр экрана",
    );
  }

  async function arrangeWindow(command: OxDeckWindowCommand, name: string) {
    if (windowCommandPending) return;
    setWindowCommandPending(true);
    const result = await window.oxdeck.arrangeWindow(command);
    setWindowCommandPending(false);

    if (!result.ok) {
      setStatus(result.message);
      return;
    }

    setActiveWindowCommand(command);
    setStatus(`Команда отправлена: ${name}`);
    window.setTimeout(() => setActiveWindowCommand(null), 500);
  }

  async function openApp(application: Application) {
    setStatus(`Открываю ${application.name}…`);
    const result = await window.oxdeck.openApp(application.id);
    if (!result.ok) setStatus(result.message);
  }

  async function revealFile(item: FileShelfItem) {
    const result = await window.oxdeck.revealFile(item.path);
    setStatus(result.ok ? `Показан ${item.name}` : result.message);
    if (!result.ok) refreshFiles();
  }

  async function removeFile(item: FileShelfItem) {
    setFiles(await window.oxdeck.removeFile(item.path));
    setStatus(`${item.name} убран с полки`);
  }

  function hasFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer?.types || []).includes("Files");
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave() {
    dragDepth.current -= 1;
    if (dragDepth.current > 0) return;
    dragDepth.current = 0;
    setDropActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.oxdeck.pathForFile(file))
      .filter(Boolean);
    const result = await window.oxdeck.addFiles(paths);

    if (!result.ok) {
      setStatus(result.message);
      return;
    }

    setFiles(result.items);
    const skipped = paths.length - result.added;
    setStatus(
      result.added
        ? `Добавлено: ${result.added}${skipped ? `, уже на полке: ${skipped}` : ""}`
        : "Эти объекты уже находятся на полке",
    );
  }

  return (
    <main
      className={`panel ${settingsState?.activeMode === "workspace" ? "workspace" : "compact"} ${animation}${dropActive ? " file-drag-over" : ""}`}
      aria-label="Панель быстрого доступа"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="relative z-[1] mx-0.5 mb-2.5 flex items-center justify-between">
        <div>
          <p className="mb-0.5 text-[8px] font-extrabold tracking-[0.16em] text-[#777985]">
            OXDECK · OXLAB
          </p>
          <h1 className="text-[15px] leading-none font-bold tracking-[-0.02em]">
            {settingsState?.activeMode === "workspace"
              ? "Рабочая панель"
              : "Мои приложения"}
          </h1>
        </div>
        <div className="ml-auto flex gap-1.5" aria-label="Показатели системы">
          <span className="metric">
            <small>CPU</small>
            <strong>{stats.cpu === null ? "—%" : `${stats.cpu}%`}</strong>
          </span>
          <span className="metric">
            <small>RAM</small>
            <strong>
              {stats.memory === null ? "—%" : `${stats.memory}%`}
            </strong>
          </span>
          <span className="metric" title="Температура аккумулятора">
            <small>BAT</small>
            <strong>
              {stats.batteryTemperature === null
                ? "—°"
                : `${stats.batteryTemperature}°`}
            </strong>
          </span>
        </div>
        <div className="window-actions">
          <button
            className="settings-button"
            type="button"
            aria-label="Открыть настройки"
            onClick={openSettings}
          >
            ⚙
          </button>
          <button
            className="quit"
            type="button"
            aria-label="Закрыть приложение"
            onClick={() => window.oxdeck.quit()}
          >
            ×
          </button>
        </div>
      </header>

      <section className="apps relative z-[1] grid grid-cols-4 gap-[9px]">
        {applications.map((application) => (
          <button
            className="app flex min-w-0 items-center gap-2 px-[9px] py-2"
            type="button"
            key={application.id}
            onClick={() => openApp(application)}
          >
            <span
              className={`icon ${application.id}`}
              aria-hidden="true"
            >
              {application.id === "finder" && <i>⌣</i>}
              {application.id === "terminal" && <i>&gt;_</i>}
            </span>
            <strong>{application.name}</strong>
          </button>
        ))}
      </section>

      <section className="window-manager" aria-label="Управление окнами">
        <div className="window-manager-heading">
          <strong>УПРАВЛЕНИЕ ОКНАМИ</strong>
          <span>MACOS</span>
        </div>
        <div className="window-command-grid">
          {windowCommands.map((command) => (
            <button
              className={`window-command ${command.id}${activeWindowCommand === command.id ? " active" : ""}`}
              type="button"
              key={command.id}
              disabled={windowCommandPending}
              title={command.name}
              onClick={() => arrangeWindow(command.id, command.name)}
            >
              <span className="window-layout-icon" aria-hidden="true">
                <i />
              </span>
              <strong>{command.name}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="file-shelf" aria-label="Файловая полка">
        <div className="shelf-heading">
          <strong>ФАЙЛОВАЯ ПОЛКА</strong>
          <span>{files.length}</span>
        </div>
        <div className="shelf-items">
          {files.length ? (
            files.map((item) => (
              <FileCard
                key={item.path}
                item={item}
                onRemove={removeFile}
                onReveal={revealFile}
              />
            ))
          ) : (
            <p className="shelf-empty">Перетащите сюда файлы из Finder</p>
          )}
        </div>
      </section>

      <div className="status relative z-[1] mx-0.5 mt-2 flex justify-between text-[9px] text-[#777985]">
        <span aria-live="polite">{status}</span>
        <span className="version">v{version}</span>
      </div>

      {settingsOpen && settingsState && (
        <div className="settings-backdrop">
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-heading">
              <div>
                <small>OXDECK</small>
                <h2 id="settings-title">Настройки панели</h2>
              </div>
              <button
                type="button"
                aria-label="Закрыть настройки"
                onClick={closeSettings}
              >
                ×
              </button>
            </div>

            <fieldset className="mode-options">
              <legend>Режим</legend>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={draftMode === "compact"}
                  onChange={() => setDraftMode("compact")}
                />
                <span>
                  <strong>Компактный</strong>
                  <small>Раскрывается по наведению</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={draftMode === "workspace"}
                  onChange={() => setDraftMode("workspace")}
                />
                <span>
                  <strong>Рабочая панель</strong>
                  <small>Закреплена слева на мониторе</small>
                </span>
              </label>
            </fieldset>

            <label className="display-select">
              <span>Монитор</span>
              <select
                value={draftDisplayId ?? ""}
                disabled={draftMode === "compact"}
                onChange={(event) =>
                  setDraftDisplayId(Number(event.target.value))
                }
              >
                {!settingsState.displays.some(
                  (display) => display.id === draftDisplayId,
                ) &&
                  settingsState.settings.display && (
                    <option value={settingsState.settings.display.id} disabled>
                      {settingsState.settings.display.label || "Монитор"} — не
                      подключён
                    </option>
                  )}
                {settingsState.displays.map((display) => (
                  <option key={display.id} value={display.id}>
                    {display.name}
                    {display.internal ? " · Встроенный" : ""} · {display.width}×
                    {display.height}
                  </option>
                ))}
              </select>
            </label>

            {settingsError && <p className="settings-error">{settingsError}</p>}

            <div className="settings-actions">
              <button type="button" onClick={closeSettings}>
                Отмена
              </button>
              <button
                className="primary"
                type="button"
                disabled={draftMode === "workspace" && draftDisplayId === null}
                onClick={saveSettings}
              >
                Сохранить
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
