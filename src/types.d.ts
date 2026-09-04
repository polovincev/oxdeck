declare module "*.css";

type OxDeckResult =
  | { ok: true }
  | { ok: false; message: string };

type OxDeckFile = {
  path: string;
  name: string;
  exists: boolean;
  isDirectory: boolean;
  icon: string | null;
};

type OxDeckStats = {
  cpu: number | null;
  memory: number | null;
  batteryTemperature: number | null;
};

type OxDeckMode = "compact" | "workspace";
type OxDeckWindowCommand =
  | "left"
  | "right"
  | "topRight"
  | "bottomRight"
  | "maximize";

type OxDeckDisplay = {
  id: number;
  label: string;
  name?: string;
  internal: boolean;
  width: number;
  height: number;
};

type OxDeckSettingsState = {
  settings: {
    mode: OxDeckMode;
    display: OxDeckDisplay | null;
  };
  displays: Array<OxDeckDisplay & { name: string }>;
  activeMode: OxDeckMode;
  targetAvailable: boolean;
};

interface Window {
  oxdeck: {
    openApp: (id: string) => Promise<OxDeckResult>;
    getVersion: () => Promise<string>;
    getSettings: () => Promise<OxDeckSettingsState>;
    saveSettings: (settings: {
      mode: OxDeckMode;
      displayId: number | null;
    }) => Promise<
      | { ok: true; state: OxDeckSettingsState }
      | { ok: false; message: string }
    >;
    arrangeWindow: (command: OxDeckWindowCommand) => Promise<OxDeckResult>;
    focusSettings: () => Promise<void>;
    releaseFocus: () => void;
    pathForFile: (file: File) => string;
    listFiles: () => Promise<OxDeckFile[]>;
    addFiles: (
      paths: string[],
    ) => Promise<
      | { ok: true; added: number; items: OxDeckFile[] }
      | { ok: false; message: string }
    >;
    removeFile: (path: string) => Promise<OxDeckFile[]>;
    revealFile: (path: string) => Promise<OxDeckResult>;
    startFileDrag: (path: string) => void;
    onShow: (callback: () => void) => () => void;
    onHide: (callback: () => void) => () => void;
    onStats: (callback: (stats: OxDeckStats) => void) => () => void;
    onSettingsChange: (
      callback: (state: OxDeckSettingsState) => void,
    ) => () => void;
    quit: () => void;
  };
}
