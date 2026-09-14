import type { MetricId, WindowCommand } from "../shared/layout";

export const commands: Array<{
  id: WindowCommand;
  name: string;
  icon: string;
}> = [
  { id: "left", name: "Левая половина", icon: "◧" },
  { id: "right", name: "Правая половина", icon: "◨" },
  { id: "leftThird", name: "Левая треть", icon: "⅓←" },
  { id: "centerThird", name: "Центральная треть", icon: "⅓" },
  { id: "rightThird", name: "Правая треть", icon: "⅓→" },
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
  | { type: "files" }
  | { type: "kubernetes" }
  | { type: "rewrite"; instruction?: string };

export const rewriteLabels = {
  idle: "Переписать текст",
  working: "Обработка…",
  done: "Готово",
} as const;

export const kubernetesLabel = "Kubernetes";
export const kubernetesSections = [
  { id: "contexts", name: "Кластер" },
  { id: "namespaces", name: "Namespace" },
  { id: "pods", name: "Поды" },
  { id: "actions", name: "Действия" },
] as const;
export const kubernetesParameterLabels = {
  container: "Контейнер",
  logMode: "Режим логов",
  tail: "Количество строк",
  since: "Период",
  format: "Формат",
  shell: "Оболочка",
  resource: "Ресурс",
  service: "Service",
  localPort: "Локальный порт",
  remotePort: "Порт назначения",
  wide: "Вид списка",
} as const;
export const kubernetesActionOptions = [
  { id: "pods", name: "Список подов", detail: "Команда get pods" },
  { id: "logs", name: "Логи", detail: "Последние строки / поток" },
  { id: "describe", name: "Описание", detail: "Состояние и события" },
  { id: "manifest", name: "YAML / JSON", detail: "Конфигурация pod" },
  { id: "exec", name: "Войти", detail: "Оболочка контейнера" },
  { id: "forward", name: "Port-forward", detail: "Проброс порта" },
] as const;
export const kubernetesFormats = [
  { id: "yaml", name: "YAML" },
  { id: "json", name: "JSON" },
] as const;
export const kubernetesShells = [
  { id: "sh", name: "sh" },
  { id: "bash", name: "bash" },
] as const;
export const kubernetesResources = [
  { id: "pod", name: "Pod" },
  { id: "service", name: "Service" },
] as const;
export const kubernetesLinePresets = ["100", "200", "500"].map((id) => ({
  id,
  name: id,
}));
export const kubernetesPeriodPresets = [
  { id: "", name: "Любой период" },
  { id: "15m", name: "15 минут" },
  { id: "1h", name: "1 час" },
];
export const kubernetesContainerKinds = {
  app: "Контейнер",
  init: "Init",
  sidecar: "Sidecar",
  ephemeral: "Отладочный",
} as const;
export const kubernetesLogModes = [
  { id: "snapshot", name: "Последние логи" },
  { id: "follow", name: "Непрерывный просмотр" },
  { id: "previous", name: "Предыдущий запуск контейнера" },
] as const;
