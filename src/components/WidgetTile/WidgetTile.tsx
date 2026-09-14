import type { LayoutWidget } from "../../../shared/layout";
import {
  commands,
  metricOptions,
  kubernetesLabel,
  rewriteLabels,
} from "../../catalog";
import { Button } from "../../ui/Button/Button";
import { FileShelf } from "../FileShelf/FileShelf";
import "./WidgetTile.css";

type WidgetTileProps = {
  widget: LayoutWidget;
  editing: boolean;
  stats: OxDeckStats;
  rewriteStatus: keyof typeof rewriteLabels;
  kubernetesContext: string;
  kubernetesNamespace: string;
  onActivate: (widget: LayoutWidget) => void;
  onConfigure: (widget: LayoutWidget) => void;
  onResize: (widget: LayoutWidget, width: number, height: number) => void;
  onRemove: (id: string) => void;
  onStatus: (text: string) => void;
};

const fileResizeActions = [
  ["Уже", "←", -1, 0],
  ["Шире", "→", 1, 0],
  ["Ниже", "↓", 0, 1],
  ["Выше", "↑", 0, -1],
] as const;

function metricValue(
  widget: Extract<LayoutWidget, { type: "metric" }>,
  stats: OxDeckStats,
) {
  const value = stats[widget.metric];
  if (value === null) {
    return "—";
  }
  if (widget.metric === "batteryTemperature") {
    return `${value}°`;
  }
  if (widget.metric === "disk") {
    return `${value} ГБ`;
  }
  return `${value}%`;
}

export function WidgetTile({
  widget,
  editing,
  stats,
  rewriteStatus,
  kubernetesContext,
  kubernetesNamespace,
  onActivate,
  onConfigure,
  onResize,
  onRemove,
  onStatus,
}: WidgetTileProps) {
  const command =
    widget.type === "window"
      ? commands.find(({ id }) => id === widget.command)
      : null;

  return (
    <article
      className={`widget ${widget.type}${widget.type === "app" && widget.exists === false ? " missing" : ""}`}
      draggable={editing}
      style={{
        gridColumn: `${widget.x + 1} / span ${widget.w}`,
        gridRow: `${widget.y + 1} / span ${widget.h}`,
      }}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/widget", widget.id)
      }
    >
      {(widget.type === "app" || widget.type === "window") && (
        <Button
          className="widget-body"
          type="button"
          disabled={editing}
          onClick={() => onActivate(widget)}
        >
          {widget.type === "app" ? (
            <>
              {widget.icon ? (
                <img src={widget.icon} alt="" />
              ) : (
                <span className="fallback">?</span>
              )}
              <strong>{widget.name}</strong>
            </>
          ) : (
            <>
              <span className="command-icon">{command?.icon}</span>
              <strong>{command?.name}</strong>
            </>
          )}
        </Button>
      )}
      {widget.type === "metric" && (
        <div className="widget-body metric">
          <small>
            {metricOptions.find(({ id }) => id === widget.metric)?.name}
          </small>
          <strong>{metricValue(widget, stats)}</strong>
        </div>
      )}
      {widget.type === "files" && (
        <FileShelf editing={editing} notify={onStatus} />
      )}
      {widget.type === "kubernetes" && (
        <Button
          className="widget-body kubernetes-body"
          type="button"
          disabled={editing}
          onClick={() => onActivate(widget)}
        >
          <strong>{kubernetesLabel}</strong>
          <small title={kubernetesContext}>
            {kubernetesContext || "Выберите контекст"}
          </small>
          <small title={kubernetesNamespace}>{kubernetesNamespace}</small>
        </Button>
      )}
      {widget.type === "rewrite" && (
        <Button
          className="widget-body rewrite-body"
          type="button"
          disabled={editing || rewriteStatus === "working"}
          aria-label={rewriteLabels.idle}
          aria-busy={rewriteStatus === "working"}
          onClick={() => onActivate(widget)}
        >
          <span className="rewrite-icon" aria-hidden="true">
            {rewriteStatus === "done" ? "✓" : "✎"}
          </span>
          <strong role="status">{rewriteLabels[rewriteStatus]}</strong>
        </Button>
      )}
      {editing && (
        <div className="widget-tools">
          {widget.type !== "files" &&
            widget.type !== "kubernetes" &&
            widget.type !== "rewrite" && (
              <Button
                type="button"
                aria-label="Настроить"
                onClick={() => onConfigure(widget)}
              >
                •••
              </Button>
            )}
          {(widget.type === "metric" || widget.type === "kubernetes") && (
            <Button
              type="button"
              aria-label="Изменить размер"
              onClick={() => onResize(widget, 0, 0)}
            >
              ↔
            </Button>
          )}
          {widget.type === "files" &&
            fileResizeActions.map(([label, icon, width, height]) => (
              <Button
                type="button"
                key={label}
                aria-label={label}
                onClick={() => onResize(widget, width, height)}
              >
                {icon}
              </Button>
            ))}
          <Button
            variant="danger"
            type="button"
            aria-label="Удалить"
            onClick={() => onRemove(widget.id)}
          >
            ×
          </Button>
        </div>
      )}
    </article>
  );
}
