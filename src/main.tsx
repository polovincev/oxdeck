import {
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  packWidgets,
  panelWidths,
  placeWidget,
  uiScales,
  type LayoutWidget,
  type MetricId,
  type PanelSide,
  type PanelWidth,
  type UiScale,
  type WindowCommand,
} from "../shared/layout";
import "./styles.css";

const commands: Array<{ id: WindowCommand; name: string; icon: string }> = [
  { id: "left", name: "Левая половина", icon: "◧" },
  { id: "right", name: "Правая половина", icon: "◨" },
  { id: "top", name: "Верхняя половина", icon: "⬒" },
  { id: "bottom", name: "Нижняя половина", icon: "⬓" },
  { id: "topLeft", name: "Слева сверху", icon: "◰" },
  { id: "topRight", name: "Справа сверху", icon: "◳" },
  { id: "bottomLeft", name: "Слева снизу", icon: "◱" },
  { id: "bottomRight", name: "Справа снизу", icon: "◲" },
  { id: "maximize", name: "Развернуть", icon: "▣" },
];
const metricOptions: Array<{ id: MetricId; name: string }> = [
  { id: "cpu", name: "CPU" },
  { id: "memory", name: "RAM" },
  { id: "battery", name: "Заряд" },
  { id: "batteryTemperature", name: "Температура" },
  { id: "disk", name: "Свободный диск" },
];
const columns: Record<PanelWidth, number> = { 50: 10, 60: 12, 70: 14, 100: 20 };
const emptyStats: OxDeckStats = {
  cpu: null,
  memory: null,
  battery: null,
  batteryTemperature: null,
  disk: null,
};
type WidgetConfig =
  | { type: "app"; path: string; name: string }
  | { type: "window"; command: WindowCommand }
  | { type: "metric"; metric: MetricId }
  | { type: "files" };

function metricValue(metric: MetricId, stats: OxDeckStats) {
  const value = stats[metric];
  if (value === null) return "—";
  if (metric === "batteryTemperature") return `${value}°`;
  if (metric === "disk") return `${value} ГБ`;
  return `${value}%`;
}

function FileShelf({ editing, notify }: { editing: boolean; notify: (text: string) => void }) {
  const [items, setItems] = useState<OxDeckFile[]>([]);
  const [drop, setDrop] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => void window.oxdeck.listFiles().then(setItems), []);

  async function open(item: OxDeckFile) {
    if (editing) return;
    const result = await window.oxdeck.openFile(item.path);
    if (!result.ok) notify(result.message);
  }

  async function menu(event: React.MouseEvent, item: OxDeckFile) {
    event.preventDefault();
    if (editing) return;
    const action = await window.oxdeck.fileMenu(item.path);
    if (action === "reveal") {
      const result = await window.oxdeck.revealFile(item.path);
      if (!result.ok) notify(result.message);
    }
    if (action === "remove") setItems(await window.oxdeck.removeFile(item.path));
    if (action === "replace") setItems(await window.oxdeck.replaceFile(item.path));
  }

  function startDrag(event: DragEvent, item: OxDeckFile) {
    if (editing || !item.exists) return;
    event.preventDefault();
    event.stopPropagation();
    window.oxdeck.startFileDrag(item.path);
  }

  function hasFiles(event: DragEvent) {
    return !editing && Array.from(event.dataTransfer.types).includes("Files");
  }

  async function receive(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDrop(false);
    const paths = Array.from(event.dataTransfer.files)
      .map(window.oxdeck.pathForFile)
      .filter(Boolean);
    const result = await window.oxdeck.addFiles(paths);
    if (!result.ok) return notify(result.message);
    setItems(result.items);
    notify(result.added ? `Добавлено: ${result.added}` : "Эти файлы уже на полке");
  }

  return (
    <section
      className={`file-shelf${drop ? " drop" : ""}`}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        dragDepth.current += 1;
        setDrop(true);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDrop(false);
        }
      }}
      onDrop={receive}
    >
      <header><strong>ФАЙЛЫ</strong><span>{items.length}</span></header>
      <div className="file-grid">
        {items.length ? items.map((item) => (
          <button
            className={`file${item.exists ? "" : " missing"}`}
            type="button"
            key={item.path}
            disabled={editing}
            draggable={!editing && item.exists}
            title={item.exists ? item.path : `${item.path}\nФайл недоступен`}
            onClick={() => void open(item)}
            onContextMenu={(event) => void menu(event, item)}
            onDragStart={(event) => startDrag(event, item)}
          >
            {item.icon ? <img src={item.icon} alt="" /> : <span>{item.isDirectory ? "▰" : "▧"}</span>}
            <small>{item.name}</small>
          </button>
        )) : <p>{drop ? "Отпустите файлы" : "Перетащите файлы сюда"}</p>}
      </div>
    </section>
  );
}

function Dashboard() {
  const [state, setState] = useState<OxDeckState | null>(null);
  const [stats, setStats] = useState(emptyStats);
  const [previewWidth, setPreviewWidth] = useState<PanelWidth | null>(null);
  const [rows, setRows] = useState(1);
  const [cell, setCell] = useState(100);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutWidget[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    displayId: null as number | null,
    side: "left" as PanelSide,
    width: 50 as PanelWidth,
    scale: 1 as UiScale,
    launchAtLogin: false,
  });
  const [picker, setPicker] = useState<{
    x: number;
    y: number;
    id?: string;
    kind?: LayoutWidget["type"];
  } | null>(null);
  const [applications, setApplications] = useState<OxDeckApplication[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.oxdeck.getState().then((next) => {
      setState(next);
      if (next.firstRun) openSettings(next);
    });
    const cleanups = [
      window.oxdeck.onStateChange((next) => {
        setState(next);
        setPreviewWidth(null);
        if (next.firstRun) openSettings(next);
      }),
      window.oxdeck.onStats(setStats),
      window.oxdeck.onWidthPreview(setPreviewWidth),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const width = previewWidth ?? state?.geometry.width ?? 50;
  const cols = Math.round(columns[width] / (state?.geometry.scale ?? 1));

  useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const gap = 12;
      const cell = (element.clientWidth - gap * (cols - 1)) / cols;
      setCell(cell);
      setRows(Math.max(1, Math.floor((element.clientHeight + gap) / (cell + gap))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cols, Boolean(state)]);

  const source = editing ? draft : state?.layout ?? [];
  const packed = useMemo(() => packWidgets(source, cols, rows), [source, cols, rows]);
  const occupied = useMemo(() => {
    const cells = new Set<string>();
    for (const widget of packed.items) {
      for (let y = widget.y; y < widget.y + widget.h; y += 1) {
        for (let x = widget.x; x < widget.x + widget.w; x += 1) cells.add(`${x}:${y}`);
      }
    }
    return cells;
  }, [packed.items]);

  function openSettings(next = state) {
    if (!next) return;
    window.oxdeck.setEditing(true);
    setSettingsDraft({
      displayId: next.display?.id ?? next.displays[0]?.id ?? null,
      side: next.geometry.side,
      width: next.geometry.width,
      scale: next.geometry.scale,
      launchAtLogin: next.launchAtLogin,
    });
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (state?.firstRun) return;
    setSettingsOpen(false);
    window.oxdeck.setEditing(editing);
  }

  async function saveSettings() {
    const result = await window.oxdeck.saveSettings(settingsDraft);
    if (!result.ok) return setStatus(result.message);
    setState(result.state);
    setSettingsOpen(false);
    window.oxdeck.setEditing(false);
  }

  function beginEditing() {
    if (packed.hidden) return setStatus(`Не помещается: ${packed.hidden}. Сначала увеличьте ширину.`);
    setDraft(packed.items);
    setEditing(true);
    window.oxdeck.setEditing(true);
  }

  async function saveLayout() {
    const result = await window.oxdeck.saveLayout(draft);
    if (!result.ok) return setStatus(result.message);
    setEditing(false);
    window.oxdeck.setEditing(false);
  }

  function cancelEditing() {
    setEditing(false);
    setPicker(null);
    window.oxdeck.setEditing(false);
  }

  function put(widget: LayoutWidget) {
    const next = placeWidget(draft, widget, cols, rows);
    if (!next) return setStatus("Эти клетки заняты или находятся за пределами сетки");
    setDraft(next);
    setPicker(null);
  }

  function choose(kind: LayoutWidget["type"]) {
    if (!picker) return;
    if (kind === "files") {
      put({ id: crypto.randomUUID(), type: "files", x: picker.x, y: picker.y, w: 2, h: 2 });
      return;
    }
    setPicker({ ...picker, kind });
    setSearch("");
    if (kind === "app" && !applications.length) void window.oxdeck.listApplications().then(setApplications);
  }

  function configure(widget: LayoutWidget) {
    setPicker({ x: widget.x, y: widget.y, id: widget.id, kind: widget.type });
    if (widget.type === "app" && !applications.length) void window.oxdeck.listApplications().then(setApplications);
  }

  function replace(values: WidgetConfig) {
    if (!picker) return;
    const current = draft.find(({ id }) => id === picker.id);
    put({
      ...values,
      id: current?.id ?? crypto.randomUUID(),
      x: current?.x ?? picker.x,
      y: current?.y ?? picker.y,
      w: current?.w ?? 1,
      h: current?.h ?? 1,
    } as LayoutWidget);
  }

  function resize(widget: LayoutWidget, dw: number, dh: number) {
    let w = widget.w + dw;
    let h = widget.h + dh;
    if (widget.type === "metric") {
      w = widget.w === 1 ? 2 : 1;
      h = 1;
    }
    if (widget.type === "files") {
      w = Math.max(2, w);
      h = Math.max(2, h);
    }
    put({ ...widget, w, h });
  }

  function dropWidget(event: DragEvent) {
    if (!editing) return;
    event.preventDefault();
    const element = grid.current;
    const id = event.dataTransfer.getData("text/widget");
    const widget = draft.find((item) => item.id === id);
    if (!element || !widget) return;
    const bounds = element.getBoundingClientRect();
    const gap = 12;
    const cell = (bounds.width - gap * (cols - 1)) / cols;
    put({
      ...widget,
      x: Math.max(0, Math.floor((event.clientX - bounds.left) / (cell + gap))),
      y: Math.max(0, Math.floor((event.clientY - bounds.top) / (cell + gap))),
    });
  }

  function resizePanel(event: PointerEvent) {
    event.preventDefault();
    const move = (next: globalThis.PointerEvent) => window.oxdeck.resizePanel(next.screenX);
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      void window.oxdeck.finishResize();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  if (!state) return null;

  return (
    <main
      className={`dashboard ${editing ? "editing" : ""}`}
      style={{ "--ui-scale": state.geometry.scale } as React.CSSProperties}
    >
      <header className="toolbar">
        <strong>OXDECK</strong>
        <span>{width}% · {cols}×{rows} · {Math.round(state.geometry.scale * 100)}%</span>
        {packed.hidden > 0 && <span className="warning">Скрыто: {packed.hidden}</span>}
        <nav>
          {editing ? <>
            <button type="button" onClick={cancelEditing}>Отмена</button>
            <button className="primary" type="button" onClick={() => void saveLayout()}>Сохранить</button>
          </> : <>
            <button type="button" onClick={beginEditing}>Изменить</button>
            <button type="button" aria-label="Настройки" onClick={() => openSettings()}>⚙</button>
            <button type="button" aria-label="Свернуть" onClick={window.oxdeck.minimize}>—</button>
          </>}
        </nav>
      </header>

      <div
        className="grid"
        ref={grid}
        style={{ "--columns": cols, "--rows": rows, "--cell": `${cell}px` } as React.CSSProperties}
        onDragOver={(event) => editing && event.preventDefault()}
        onDrop={dropWidget}
      >
        <div className="slots">
          {Array.from({ length: cols * rows }, (_, index) => {
            const x = index % cols;
            const y = Math.floor(index / cols);
            return <button
              type="button"
              key={`${x}:${y}`}
              className={occupied.has(`${x}:${y}`) ? "occupied" : ""}
              aria-label={`Клетка ${x + 1}, ${y + 1}`}
              disabled={!editing || occupied.has(`${x}:${y}`)}
              onClick={() => setPicker({ x, y })}
            />;
          })}
        </div>
        <div className="widgets">
          {packed.items.map((widget) => (
            <article
              className={`widget ${widget.type}${widget.type === "app" && widget.exists === false ? " missing" : ""}`}
              key={widget.id}
              draggable={editing}
              style={{
                gridColumn: `${widget.x + 1} / span ${widget.w}`,
                gridRow: `${widget.y + 1} / span ${widget.h}`,
              }}
              onDragStart={(event) => event.dataTransfer.setData("text/widget", widget.id)}
            >
              {widget.type === "app" && <button className="widget-body" type="button" disabled={editing} onClick={async () => {
                const result = await window.oxdeck.openApp(widget.path);
                if (!result.ok) setStatus(result.message);
              }}>
                {widget.icon ? <img src={widget.icon} alt="" /> : <span className="fallback">?</span>}
                <strong>{widget.name}</strong>
              </button>}
              {widget.type === "window" && <button className="widget-body" type="button" disabled={editing} onClick={async () => {
                const result = await window.oxdeck.arrangeWindow(widget.command);
                if (!result.ok) setStatus(result.message);
              }}>
                <span className="command-icon">{commands.find(({ id }) => id === widget.command)?.icon}</span>
                <strong>{commands.find(({ id }) => id === widget.command)?.name}</strong>
              </button>}
              {widget.type === "metric" && <div className="widget-body metric">
                <small>{metricOptions.find(({ id }) => id === widget.metric)?.name}</small>
                <strong>{metricValue(widget.metric, stats)}</strong>
              </div>}
              {widget.type === "files" && <FileShelf editing={editing} notify={setStatus} />}
              {editing && <div className="widget-tools">
                {widget.type !== "files" && <button type="button" aria-label="Настроить" onClick={() => configure(widget)}>•••</button>}
                {widget.type === "metric" && <button type="button" aria-label="Изменить размер" onClick={() => resize(widget, 0, 0)}>↔</button>}
                {widget.type === "files" && <>
                  <button type="button" aria-label="Уже" onClick={() => resize(widget, -1, 0)}>←</button>
                  <button type="button" aria-label="Шире" onClick={() => resize(widget, 1, 0)}>→</button>
                  <button type="button" aria-label="Ниже" onClick={() => resize(widget, 0, 1)}>↓</button>
                  <button type="button" aria-label="Выше" onClick={() => resize(widget, 0, -1)}>↑</button>
                </>}
                <button className="danger" type="button" aria-label="Удалить" onClick={() => setDraft(draft.filter(({ id }) => id !== widget.id))}>×</button>
              </div>}
            </article>
          ))}
        </div>
      </div>

      {status && <button className="toast" type="button" onClick={() => setStatus("")}>{status}</button>}
      <div className={`resize-handle ${state.geometry.side}`} onPointerDown={resizePanel} />

      {settingsOpen && <div className="backdrop"><section className="dialog" role="dialog" aria-modal="true">
        <header><div><small>OXDECK</small><h2>{state.firstRun ? "Первый запуск" : "Настройки"}</h2></div>
          {!state.firstRun && <button type="button" onClick={closeSettings}>×</button>}
        </header>
        <label>Монитор<select value={settingsDraft.displayId ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, displayId: Number(event.target.value) })}>
          {state.displays.map((display) => <option key={display.id} value={display.id}>{display.name} · {display.width}×{display.height}</option>)}
        </select></label>
        <fieldset><legend>Сторона</legend>{(["left", "right"] as const).map((side) => <label key={side}><input type="radio" checked={settingsDraft.side === side} onChange={() => setSettingsDraft({ ...settingsDraft, side })} />{side === "left" ? "Слева" : "Справа"}</label>)}</fieldset>
        <fieldset><legend>Ширина</legend>{panelWidths.map((value) => <label key={value}><input type="radio" checked={settingsDraft.width === value} onChange={() => setSettingsDraft({ ...settingsDraft, width: value })} />{value}%</label>)}</fieldset>
        <fieldset><legend>Размер интерфейса</legend>{uiScales.map((value) => <label key={value}><input type="radio" checked={settingsDraft.scale === value} onChange={() => setSettingsDraft({ ...settingsDraft, scale: value })} />{Math.round(value * 100)}%</label>)}</fieldset>
        <label className="check"><input type="checkbox" checked={settingsDraft.launchAtLogin} onChange={(event) => setSettingsDraft({ ...settingsDraft, launchAtLogin: event.target.checked })} />Запускать при входе в macOS</label>
        <footer>{!state.firstRun && <button type="button" onClick={closeSettings}>Отмена</button>}<button className="primary" type="button" disabled={settingsDraft.displayId === null} onClick={() => void saveSettings()}>Сохранить</button></footer>
      </section></div>}

      {picker && <div className="backdrop"><section className="dialog picker" role="dialog" aria-modal="true">
        <header><h2>{picker.kind ? "Настройка плитки" : "Новая плитка"}</h2><button type="button" onClick={() => setPicker(null)}>×</button></header>
        {!picker.kind && <div className="choices">
          <button type="button" onClick={() => choose("app")}>Приложение</button>
          <button type="button" onClick={() => choose("window")}>Команда окна</button>
          <button type="button" onClick={() => choose("metric")}>Показатель</button>
          <button type="button" disabled={draft.some(({ type }) => type === "files")} onClick={() => choose("files")}>Файловый буфер</button>
        </div>}
        {picker.kind === "app" && <>
          <input autoFocus type="search" placeholder="Поиск приложения" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="option-list">{applications.filter(({ name }) => name.toLowerCase().includes(search.toLowerCase())).map((application) => <button type="button" key={application.path} onClick={() => replace({ type: "app", path: application.path, name: application.name })}>{application.icon && <img src={application.icon} alt="" />}<span>{application.name}</span></button>)}</div>
          <button className="wide" type="button" onClick={async () => { const application = await window.oxdeck.pickApplication(); if (application) replace({ type: "app", path: application.path, name: application.name }); }}>Выбрать другое…</button>
        </>}
        {picker.kind === "window" && <div className="option-list">{commands.map((command) => <button type="button" key={command.id} onClick={() => replace({ type: "window", command: command.id })}><span>{command.icon}</span><span>{command.name}</span></button>)}</div>}
        {picker.kind === "metric" && <div className="option-list">{metricOptions.map((metric) => {
          const used = draft.some((item) => item.type === "metric" && item.metric === metric.id && item.id !== picker.id);
          return <button type="button" key={metric.id} disabled={used} onClick={() => replace({ type: "metric", metric: metric.id })}>{metric.name}</button>;
        })}</div>}
      </section></div>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Dashboard /></StrictMode>);
