import {
  panelWidths,
  uiScales,
  type PanelSide,
  type PanelWidth,
  type UiScale,
} from "../../../shared/layout";
import type { UpdateState } from "../../../shared/updates";
import { Button } from "../../ui/Button/Button";
import { Dialog } from "../../ui/Dialog/Dialog";
import "./SettingsDialog.css";

export type SettingsDraft = {
  displayId: number | null;
  side: PanelSide;
  width: PanelWidth;
  scale: UiScale;
  launchAtLogin: boolean;
};

type SettingsDialogProps = {
  state: OxDeckState;
  draft: SettingsDraft;
  updateState: UpdateState | null;
  onChange: (draft: SettingsDraft) => void;
  onClose: () => void;
  onSave: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
};

export function SettingsDialog({
  state,
  draft,
  updateState,
  onChange,
  onClose,
  onSave,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsDialogProps) {
  return (
    <Dialog className="settings-dialog">
      <header>
        <div>
          <small>OXDECK</small>
          <h2>{state.firstRun ? "Первый запуск" : "Настройки"}</h2>
        </div>
        {!state.firstRun && (
          <Button type="button" onClick={onClose}>
            ×
          </Button>
        )}
      </header>
      <label>
        Монитор
        <select
          value={draft.displayId ?? ""}
          onChange={(event) =>
            onChange({ ...draft, displayId: Number(event.target.value) })
          }
        >
          {state.displays.map((display) => (
            <option key={display.id} value={display.id}>
              {display.name} · {display.width}×{display.height}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Сторона</legend>
        {(["left", "right"] as const).map((side) => (
          <label key={side}>
            <input
              type="radio"
              checked={draft.side === side}
              onChange={() => onChange({ ...draft, side })}
            />
            {side === "left" ? "Слева" : "Справа"}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Ширина</legend>
        {panelWidths.map((width) => (
          <label key={width}>
            <input
              type="radio"
              checked={draft.width === width}
              onChange={() => onChange({ ...draft, width })}
            />
            {width}%
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Размер интерфейса</legend>
        {uiScales.map((scale) => (
          <label key={scale}>
            <input
              type="radio"
              checked={draft.scale === scale}
              onChange={() => onChange({ ...draft, scale })}
            />
            {Math.round(scale * 100)}%
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.launchAtLogin}
          onChange={(event) =>
            onChange({ ...draft, launchAtLogin: event.target.checked })
          }
        />
        Запускать при входе в macOS
      </label>
      <section className="settings-updates" aria-labelledby="updates-title">
        <div className="updates-heading">
          <h3 id="updates-title">Обновления</h3>
          {updateState && <span>Версия {updateState.currentVersion}</span>}
        </div>
        <div role="status">
          {updateState?.version && (
            <strong>Версия {updateState.version}</strong>
          )}
          <p>{updateState?.message ?? "Получаем состояние…"}</p>
        </div>
        {updateState?.status === "downloading" && (
          <progress
            aria-label="Загрузка обновления"
            max={100}
            value={updateState.progress ?? undefined}
          />
        )}
        <div className="updates-actions">
          <Button
            type="button"
            disabled={
              !updateState ||
              (updateState.status !== "idle" &&
                updateState.status !== "error" &&
                updateState.status !== "ready")
            }
            onClick={onCheckForUpdates}
          >
            Проверить сейчас
          </Button>
          {updateState?.status === "ready" && (
            <Button variant="primary" type="button" onClick={onInstallUpdate}>
              Установить и перезапустить
            </Button>
          )}
        </div>
      </section>
      <footer>
        {!state.firstRun && (
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
        )}
        <Button
          variant="primary"
          type="button"
          disabled={draft.displayId === null}
          onClick={onSave}
        >
          Сохранить
        </Button>
      </footer>
    </Dialog>
  );
}
