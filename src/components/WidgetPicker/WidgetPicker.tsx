import type { LayoutWidget } from "../../../shared/layout";
import {
  commands,
  metricOptions,
  kubernetesLabel,
  rewriteLabels,
  type WidgetConfig,
} from "../../catalog";
import { Button } from "../../ui/Button/Button";
import { Dialog } from "../../ui/Dialog/Dialog";
import "./WidgetPicker.css";

export type PickerState = {
  x: number;
  y: number;
  id?: string;
  kind?: LayoutWidget["type"];
};

type WidgetPickerProps = {
  picker: PickerState;
  layout: LayoutWidget[];
  applications: OxDeckApplication[];
  search: string;
  onSearch: (search: string) => void;
  onClose: () => void;
  onChoose: (kind: LayoutWidget["type"]) => void;
  onReplace: (widget: WidgetConfig) => void;
};

export function WidgetPicker({
  picker,
  layout,
  applications,
  search,
  onSearch,
  onClose,
  onChoose,
  onReplace,
}: WidgetPickerProps) {
  const visibleApplications = applications.filter(({ name }) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );

  function replaceApplication(
    application: Pick<OxDeckApplication, "path" | "name">,
  ) {
    onReplace({
      type: "app",
      path: application.path,
      name: application.name,
    });
  }

  async function pickApplication() {
    const application = await window.oxdeck.pickApplication();
    if (application) {
      replaceApplication(application);
    }
  }

  return (
    <Dialog className="widget-picker">
      <header>
        <h2>{picker.kind ? "Настройка плитки" : "Новая плитка"}</h2>
        <Button type="button" onClick={onClose}>
          ×
        </Button>
      </header>
      {!picker.kind && (
        <div className="choices">
          <Button
            type="button"
            disabled={layout.some(({ type }) => type === "rewrite")}
            onClick={() => onChoose("rewrite")}
          >
            {rewriteLabels.idle}
          </Button>
          <Button
            type="button"
            disabled={layout.some(({ type }) => type === "kubernetes")}
            onClick={() => onChoose("kubernetes")}
          >
            {kubernetesLabel}
          </Button>
          <Button type="button" onClick={() => onChoose("app")}>
            Приложение
          </Button>
          <Button type="button" onClick={() => onChoose("window")}>
            Команда окна
          </Button>
          <Button type="button" onClick={() => onChoose("metric")}>
            Показатель
          </Button>
          <Button
            type="button"
            disabled={layout.some(({ type }) => type === "files")}
            onClick={() => onChoose("files")}
          >
            Файловый буфер
          </Button>
        </div>
      )}
      {picker.kind === "app" && (
        <>
          <input
            autoFocus
            type="search"
            placeholder="Поиск приложения"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          <div className="option-list">
            {visibleApplications.map((application) => (
              <Button
                type="button"
                key={application.path}
                onClick={() => replaceApplication(application)}
              >
                <span>{application.name}</span>
              </Button>
            ))}
          </div>
          <Button
            className="button-wide"
            type="button"
            onClick={() => void pickApplication()}
          >
            Выбрать другое…
          </Button>
        </>
      )}
      {picker.kind === "window" && (
        <div className="option-list">
          {commands.map((command) => (
            <Button
              type="button"
              key={command.id}
              onClick={() => onReplace({ type: "window", command: command.id })}
            >
              <span>{command.icon}</span>
              <span>{command.name}</span>
            </Button>
          ))}
        </div>
      )}
      {picker.kind === "metric" && (
        <div className="option-list">
          {metricOptions.map((metric) => {
            const used = layout.some(
              (item) =>
                item.type === "metric" &&
                item.metric === metric.id &&
                item.id !== picker.id,
            );
            return (
              <Button
                type="button"
                key={metric.id}
                disabled={used}
                onClick={() => onReplace({ type: "metric", metric: metric.id })}
              >
                {metric.name}
              </Button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
