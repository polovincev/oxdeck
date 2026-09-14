export const panelWidths = [50, 60, 70, 100] as const;
export const uiScales = [1, 1.25, 1.5] as const;
export const windowCommands = [
  "left",
  "right",
  "leftThird",
  "centerThird",
  "rightThird",
  "top",
  "bottom",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "maximize",
] as const;
export const metricIds = [
  "cpu",
  "memory",
  "battery",
  "batteryTemperature",
  "disk",
] as const;
export const maxColumns = 20;

export type PanelWidth = (typeof panelWidths)[number];
export type UiScale = (typeof uiScales)[number];
export type PanelSide = "left" | "right";
export type WindowCommand = (typeof windowCommands)[number];
export type MetricId = (typeof metricIds)[number];

type BaseWidget = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutWidget = BaseWidget &
  (
    | {
        type: "app";
        path: string;
        name: string;
        exists?: boolean;
        icon?: string | null;
      }
    | { type: "window"; command: WindowCommand }
    | { type: "metric"; metric: MetricId }
    | { type: "files" }
    | { type: "kubernetes" }
    | { type: "rewrite"; instruction?: string }
  );

export type Rect = Pick<LayoutWidget, "x" | "y" | "w" | "h">;

export function recommendedUiScale(
  width: number,
  height: number,
  scaleFactor: number,
): UiScale {
  if (scaleFactor > 1) {
    return 1;
  }
  // ponytail: coarse hardware heuristic; replace with physical-PPI detection only if Electron exposes it.
  if (width / height >= 3 && height <= 900) {
    return 1.5;
  }
  return width >= 3800 ? 1.25 : 1;
}

export function overlaps(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function placeWidget(
  layout: LayoutWidget[],
  widget: LayoutWidget,
  cols: number,
  rows: number,
) {
  if (
    widget.x < 0 ||
    widget.y < 0 ||
    widget.x + widget.w > cols ||
    widget.y + widget.h > rows ||
    layout.some((item) => item.id !== widget.id && overlaps(item, widget))
  ) {
    return null;
  }

  return [...layout.filter((item) => item.id !== widget.id), widget];
}

export function packWidgets(
  layout: LayoutWidget[],
  cols: number,
  rows: number,
) {
  if (
    layout.every(
      (widget, index) =>
        widget.x >= 0 &&
        widget.y >= 0 &&
        widget.x + widget.w <= cols &&
        widget.y + widget.h <= rows &&
        !layout.slice(0, index).some((item) => overlaps(item, widget)),
    )
  ) {
    return { items: [...layout], hidden: 0 };
  }

  const items: LayoutWidget[] = [];

  for (const widget of [...layout].sort(
    (a, b) => a.y * maxColumns + a.x - (b.y * maxColumns + b.x),
  )) {
    let placed = false;
    for (let y = 0; y <= rows - widget.h && !placed; y += 1) {
      for (let x = 0; x <= cols - widget.w; x += 1) {
        const candidate = { ...widget, x, y };
        if (!items.some((item) => overlaps(item, candidate))) {
          items.push(candidate);
          placed = true;
          break;
        }
      }
    }
  }

  return { items, hidden: layout.length - items.length };
}
