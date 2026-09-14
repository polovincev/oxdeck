import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
} from "react";
import {
  packWidgets,
  placeWidget,
  type LayoutWidget,
  type PanelWidth,
} from "../../../shared/layout";
import type { rewriteLabels, WidgetConfig } from "../../catalog";
import { defaultRewriteInstruction } from "../../../shared/rewrite";
import {
  kubernetesNamespace,
  restoreKubernetesSettings,
} from "../../../shared/kubernetes";
import { KubernetesDialog } from "../KubernetesDialog/KubernetesDialog";
import { Button } from "../../ui/Button/Button";
import {
  SettingsDialog,
  type SettingsDraft,
} from "../SettingsDialog/SettingsDialog";
import { WidgetPicker, type PickerState } from "../WidgetPicker/WidgetPicker";
import { WidgetTile } from "../WidgetTile/WidgetTile";
import "./Dashboard.css";

const emptyStats: OxDeckStats = {
  cpu: null,
  memory: null,
  battery: null,
  batteryTemperature: null,
  disk: null,
};

function settingsFor(state: OxDeckState): SettingsDraft {
  return {
    displayId: state.display?.id ?? state.displays[0]?.id ?? null,
    side: state.geometry.side,
    width: state.geometry.width,
    scale: state.geometry.scale,
    launchAtLogin: state.launchAtLogin,
  };
}

export function Dashboard() {
  const [state, setState] = useState<OxDeckState | null>(null);
  const [stats, setStats] = useState(emptyStats);
  const [previewWidth, setPreviewWidth] = useState<PanelWidth | null>(null);
  const [rows, setRows] = useState(1);
  const [cell, setCell] = useState(100);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LayoutWidget[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    displayId: null,
    side: "left",
    width: 50,
    scale: 1,
    launchAtLogin: false,
  });
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [applications, setApplications] = useState<OxDeckApplication[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rewriteStatus, setRewriteStatus] =
    useState<keyof typeof rewriteLabels>("idle");
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [kubernetesOpen, setKubernetesOpen] = useState(false);
  const [kubernetes, setKubernetes] = useState(() => {
    try {
      return restoreKubernetesSettings(
        JSON.parse(localStorage.getItem("oxdeck.kubernetes") ?? "null"),
      );
    } catch {
      return restoreKubernetesSettings(null);
    }
  });
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rewriteStatus !== "done") {
      return;
    }
    const timer = window.setTimeout(() => setRewriteStatus("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [rewriteStatus]);

  function updateKubernetes(next: typeof kubernetes) {
    setKubernetes(next);
    try {
      localStorage.setItem("oxdeck.kubernetes", JSON.stringify(next));
    } catch {
      setStatus("Не удалось сохранить настройки Kubernetes");
    }
  }

  useEffect(() => {
    const updateState = (next: OxDeckState) => {
      setState(next);
      setPreviewWidth(null);
      if (next.firstRun) {
        window.oxdeck.setEditing(true);
        setSettingsDraft(settingsFor(next));
        setSettingsOpen(true);
      }
    };
    void window.oxdeck.getState().then(updateState);
    const cleanups = [
      window.oxdeck.onStateChange(updateState),
      window.oxdeck.onStats(setStats),
      window.oxdeck.onWidthPreview(setPreviewWidth),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const width = previewWidth ?? state?.geometry.width ?? 50;
  const cols = Math.round(width / 5 / (state?.geometry.scale ?? 1));
  const ready = state !== null;

  useEffect(() => {
    if (!ready) {
      return;
    }
    const element = grid.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const gap = 12;
      const nextCell = (element.clientWidth - gap * (cols - 1)) / cols;
      setCell(nextCell);
      setRows(
        Math.max(
          1,
          Math.floor((element.clientHeight + gap) / (nextCell + gap)),
        ),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cols, ready]);

  const layout = state?.layout;
  const packed = useMemo(
    () => packWidgets(editing ? draft : (layout ?? []), cols, rows),
    [cols, draft, editing, layout, rows],
  );
  const occupied = (() => {
    const cells = new Set<string>();
    for (const widget of packed.items) {
      for (let y = widget.y; y < widget.y + widget.h; y += 1) {
        for (let x = widget.x; x < widget.x + widget.w; x += 1) {
          cells.add(`${x}:${y}`);
        }
      }
    }
    return cells;
  })();

  function openSettings(next = state) {
    if (!next) {
      return;
    }
    window.oxdeck.setEditing(true);
    setSettingsDraft(settingsFor(next));
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (state?.firstRun) {
      return;
    }
    setSettingsOpen(false);
    window.oxdeck.setEditing(editing);
  }

  async function saveSettings() {
    const result = await window.oxdeck.saveSettings(settingsDraft);
    if (!result.ok) {
      setStatus(result.message);
      return;
    }
    setState(result.state);
    setSettingsOpen(false);
    window.oxdeck.setEditing(false);
  }

  function beginEditing() {
    if (packed.hidden) {
      setStatus(`Не помещается: ${packed.hidden}. Сначала увеличьте ширину.`);
      return;
    }
    setDraft(packed.items);
    setEditing(true);
    window.oxdeck.setEditing(true);
  }

  async function saveLayout() {
    const result = await window.oxdeck.saveLayout(draft);
    if (!result.ok) {
      setStatus(result.message);
      return;
    }
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
    if (!next) {
      setStatus("Эти клетки заняты или находятся за пределами сетки");
      return;
    }
    setDraft(next);
    setPicker(null);
  }

  function choose(kind: LayoutWidget["type"]) {
    if (!picker) {
      return;
    }
    if (kind === "files" || kind === "kubernetes" || kind === "rewrite") {
      put({
        id: crypto.randomUUID(),
        type: kind,
        x: picker.x,
        y: picker.y,
        w: kind === "files" ? 2 : 1,
        h: kind === "files" ? 2 : 1,
      });
      return;
    }
    setPicker({ ...picker, kind });
    setSearch("");
    if (kind === "app" && !applications.length) {
      void window.oxdeck.listApplications().then(setApplications);
    }
  }

  function configure(widget: LayoutWidget) {
    if (widget.type === "rewrite") {
      setRewriteInstruction(widget.instruction ?? defaultRewriteInstruction);
    }
    setPicker({ x: widget.x, y: widget.y, id: widget.id, kind: widget.type });
    if (widget.type === "app" && !applications.length) {
      void window.oxdeck.listApplications().then(setApplications);
    }
  }

  function replace(values: WidgetConfig) {
    if (!picker) {
      return;
    }
    const current = draft.find(({ id }) => id === picker.id);
    put({
      ...values,
      id: current?.id ?? crypto.randomUUID(),
      x: current?.x ?? picker.x,
      y: current?.y ?? picker.y,
      w: current?.w ?? 1,
      h: current?.h ?? 1,
    });
  }

  function resize(widget: LayoutWidget, dw: number, dh: number) {
    let w = widget.w + dw;
    let h = widget.h + dh;
    if (widget.type === "metric" || widget.type === "kubernetes") {
      w = widget.w === 1 ? 2 : 1;
      h = 1;
    }
    if (widget.type === "files") {
      w = Math.max(2, w);
      h = Math.max(2, h);
    }
    put({ ...widget, w, h });
  }

  async function activate(widget: LayoutWidget) {
    if (widget.type === "rewrite") {
      if (rewriteStatus === "working") {
        return;
      }
      setRewriteStatus("working");
      setStatus("");
      try {
        const result = await window.oxdeck.rewriteClipboard();
        setRewriteStatus(result.ok ? "done" : "idle");
        if (!result.ok) {
          setStatus(result.message);
        }
      } catch {
        setRewriteStatus("idle");
        setStatus("Не удалось переписать текст. Попробуйте ещё раз.");
      }
      return;
    }
    if (widget.type === "kubernetes") {
      window.oxdeck.setEditing(true);
      setKubernetesOpen(true);
      return;
    }
    const result =
      widget.type === "app"
        ? await window.oxdeck.openApp(widget.path)
        : widget.type === "window"
          ? await window.oxdeck.arrangeWindow(widget.command)
          : null;
    if (result && !result.ok) {
      setStatus(result.message);
    }
  }

  function dropWidget(event: DragEvent) {
    if (!editing) {
      return;
    }
    event.preventDefault();
    const element = grid.current;
    const id = event.dataTransfer.getData("text/widget");
    const widget = draft.find((item) => item.id === id);
    if (!element || !widget) {
      return;
    }
    const bounds = element.getBoundingClientRect();
    const gap = 12;
    const nextCell = (bounds.width - gap * (cols - 1)) / cols;
    put({
      ...widget,
      x: Math.max(
        0,
        Math.floor((event.clientX - bounds.left) / (nextCell + gap)),
      ),
      y: Math.max(
        0,
        Math.floor((event.clientY - bounds.top) / (nextCell + gap)),
      ),
    });
  }

  function resizePanel(event: PointerEvent) {
    event.preventDefault();
    const move = (next: globalThis.PointerEvent) =>
      window.oxdeck.resizePanel(next.screenX);
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      void window.oxdeck.finishResize();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  }

  if (!state) {
    return null;
  }

  return (
    <main
      className={`dashboard ${editing ? "editing" : ""}`}
      style={{ "--ui-scale": state.geometry.scale } as CSSProperties}
    >
      <header className="toolbar">
        <strong>OXDECK</strong>
        <span>
          {width}% · {cols}×{rows} · {Math.round(state.geometry.scale * 100)}%
        </span>
        {packed.hidden > 0 && (
          <span className="warning">Скрыто: {packed.hidden}</span>
        )}
        <nav>
          {editing ? (
            <>
              <Button type="button" onClick={cancelEditing}>
                Отмена
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => void saveLayout()}
              >
                Сохранить
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={beginEditing}>
                Изменить
              </Button>
              <Button
                type="button"
                aria-label="Настройки"
                onClick={() => openSettings()}
              >
                ⚙
              </Button>
              <Button
                type="button"
                aria-label="Свернуть"
                onClick={() => window.oxdeck.minimize()}
              >
                —
              </Button>
            </>
          )}
        </nav>
      </header>

      <div
        className="grid"
        ref={grid}
        style={
          {
            "--columns": cols,
            "--rows": rows,
            "--cell": `${cell}px`,
          } as CSSProperties
        }
        onDragOver={(event) => editing && event.preventDefault()}
        onDrop={dropWidget}
      >
        <div className="slots">
          {Array.from({ length: cols * rows }, (_, index) => {
            const x = index % cols;
            const y = Math.floor(index / cols);
            return (
              <Button
                type="button"
                key={`${x}:${y}`}
                className={occupied.has(`${x}:${y}`) ? "occupied" : ""}
                aria-label={`Клетка ${x + 1}, ${y + 1}`}
                disabled={!editing || occupied.has(`${x}:${y}`)}
                onClick={() => setPicker({ x, y })}
              />
            );
          })}
        </div>
        <div className="widgets">
          {packed.items.map((widget) => (
            <WidgetTile
              key={widget.id}
              widget={widget}
              editing={editing}
              stats={stats}
              rewriteStatus={rewriteStatus}
              kubernetesContext={kubernetes.context}
              kubernetesNamespace={kubernetesNamespace(kubernetes)}
              onActivate={(item) => void activate(item)}
              onConfigure={configure}
              onResize={resize}
              onRemove={(id) =>
                setDraft((current) => current.filter((item) => item.id !== id))
              }
              onStatus={setStatus}
            />
          ))}
        </div>
      </div>

      {status && (
        <Button className="toast" type="button" onClick={() => setStatus("")}>
          {status}
        </Button>
      )}
      <div
        className={`resize-handle ${state.geometry.side}`}
        onPointerDown={resizePanel}
      />

      {kubernetesOpen && (
        <KubernetesDialog
          settings={kubernetes}
          onChange={updateKubernetes}
          onClose={() => {
            setKubernetesOpen(false);
            window.oxdeck.setEditing(editing);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          state={state}
          draft={settingsDraft}
          onChange={setSettingsDraft}
          onClose={closeSettings}
          onSave={() => void saveSettings()}
        />
      )}

      {picker && (
        <WidgetPicker
          picker={picker}
          layout={draft}
          applications={applications}
          search={search}
          onSearch={setSearch}
          rewriteInstruction={rewriteInstruction}
          onRewriteInstructionChange={setRewriteInstruction}
          onClose={() => setPicker(null)}
          onChoose={choose}
          onReplace={replace}
        />
      )}
    </main>
  );
}
