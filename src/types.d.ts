import type {
  LayoutWidget,
  PanelSide,
  PanelWidth,
  UiScale,
  WindowCommand,
} from "../shared/layout";
import type {
  KubernetesSettings,
  KubernetesListResult,
  KubernetesPod,
} from "../shared/kubernetes";
import type { UpdateState } from "../shared/updates";

declare global {
  type OxDeckResult = { ok: true } | { ok: false; message: string };
  type OxDeckDisplay = {
    id: number;
    label: string;
    name: string;
    internal: boolean;
    width: number;
    height: number;
  };
  type OxDeckState = {
    firstRun: boolean;
    display: Omit<OxDeckDisplay, "name"> | null;
    displays: OxDeckDisplay[];
    geometry: {
      side: PanelSide;
      width: PanelWidth;
      scale: UiScale;
    };
    launchAtLogin: boolean;
    layout: LayoutWidget[];
  };
  type OxDeckApplication = {
    path: string;
    name: string;
    exists: boolean;
    icon: string | null;
  };
  type OxDeckFile = OxDeckApplication & { isDirectory: boolean };
  type OxDeckStats = {
    cpu: number | null;
    memory: number | null;
    battery: number | null;
    batteryTemperature: number | null;
    disk: number | null;
  };

  interface Window {
    oxdeck: {
      getState(): Promise<OxDeckState>;
      getUpdateState(): Promise<UpdateState>;
      checkForUpdates(): Promise<UpdateState>;
      installUpdate(): Promise<UpdateState>;
      rewriteClipboard(): Promise<OxDeckResult>;
      listKubernetesContexts(): Promise<
        { ok: true; contexts: string[] } | { ok: false; message: string }
      >;
      listKubernetesNamespaces(
        context: string,
      ): Promise<KubernetesListResult<string>>;
      listKubernetesPods(
        context: string,
        namespace: string,
      ): Promise<KubernetesListResult<KubernetesPod>>;
      copyKubernetesCommand(
        settings: KubernetesSettings,
      ): Promise<OxDeckResult>;
      saveSettings(settings: {
        displayId: number | null;
        side: PanelSide;
        width: PanelWidth;
        scale: UiScale;
        launchAtLogin: boolean;
      }): Promise<
        { ok: true; state: OxDeckState } | { ok: false; message: string }
      >;
      saveLayout(layout: LayoutWidget[]): Promise<OxDeckResult>;
      listApplications(): Promise<OxDeckApplication[]>;
      pickApplication(): Promise<Pick<
        OxDeckApplication,
        "path" | "name"
      > | null>;
      openApp(path: string): Promise<OxDeckResult>;
      arrangeWindow(command: WindowCommand): Promise<OxDeckResult>;
      setEditing(editing: boolean): void;
      minimize(): void;
      resizePanel(screenX: number): void;
      finishResize(): Promise<void>;
      pathForFile(file: File): string;
      listFiles(): Promise<OxDeckFile[]>;
      addFiles(
        paths: string[],
      ): Promise<
        | { ok: true; added: number; items: OxDeckFile[] }
        | { ok: false; message: string }
      >;
      openFile(path: string): Promise<OxDeckResult>;
      removeFile(path: string): Promise<OxDeckFile[]>;
      replaceFile(path: string): Promise<OxDeckFile[]>;
      revealFile(path: string): Promise<OxDeckResult>;
      fileMenu(path: string): Promise<"reveal" | "replace" | "remove" | null>;
      startFileDrag(path: string): void;
      onStateChange(callback: (state: OxDeckState) => void): () => void;
      onUpdateChange(callback: (state: UpdateState) => void): () => void;
      onStats(callback: (stats: OxDeckStats) => void): () => void;
      onWidthPreview(callback: (width: PanelWidth) => void): () => void;
    };
  }
}

export {};
