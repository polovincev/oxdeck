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

interface Window {
  oxdeck: {
    openApp: (id: string) => Promise<OxDeckResult>;
    getVersion: () => Promise<string>;
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
    quit: () => void;
  };
}
