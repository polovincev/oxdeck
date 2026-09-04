import type { MetricId, WindowCommand } from "../shared/layout";

export const commands: Array<{ id: WindowCommand; name: string; icon: string }> = [
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

export const metricOptions: Array<{ id: MetricId; name: string }> = [
  { id: "cpu", name: "CPU" },
  { id: "memory", name: "RAM" },
  { id: "battery", name: "Заряд" },
  { id: "batteryTemperature", name: "Температура" },
  { id: "disk", name: "Свободный диск" },
];

export type WidgetConfig =
  | { type: "app"; path: string; name: string }
  | { type: "window"; command: WindowCommand }
  | { type: "metric"; metric: MetricId }
  | { type: "files" };
