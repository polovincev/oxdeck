import { contextBridge, ipcRenderer, webUtils } from "electron";

function subscribe<T>(channel: string, callback: (value: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, value: T) =>
    callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("oxdeck", {
  getState: () => ipcRenderer.invoke("state:get"),
  getUpdateState: () => ipcRenderer.invoke("updates:get"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  rewriteClipboard: () => ipcRenderer.invoke("clipboard:rewrite"),
  listKubernetesContexts: () => ipcRenderer.invoke("kubernetes:contexts"),
  listKubernetesNamespaces: (context: string) =>
    ipcRenderer.invoke("kubernetes:namespaces", context),
  listKubernetesPods: (context: string, namespace: string) =>
    ipcRenderer.invoke("kubernetes:pods", context, namespace),
  copyKubernetesCommand: (settings: unknown) =>
    ipcRenderer.invoke("kubernetes:copy", settings),
  saveSettings: (settings: unknown) =>
    ipcRenderer.invoke("settings:save", settings),
  saveLayout: (layout: unknown) => ipcRenderer.invoke("layout:save", layout),
  listApplications: () => ipcRenderer.invoke("apps:list"),
  pickApplication: () => ipcRenderer.invoke("apps:pick"),
  openApp: (path: string) => ipcRenderer.invoke("apps:open", path),
  arrangeWindow: (command: string) =>
    ipcRenderer.invoke("windows:arrange", command),
  setEditing: (editing: boolean) => ipcRenderer.send("panel:editing", editing),
  minimize: () => ipcRenderer.send("panel:minimize"),
  resizePanel: (screenX: number) => ipcRenderer.send("panel:resize", screenX),
  finishResize: () => ipcRenderer.invoke("panel:resize-finish"),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  listFiles: () => ipcRenderer.invoke("files:list"),
  addFiles: (paths: string[]) => ipcRenderer.invoke("files:add", paths),
  openFile: (path: string) => ipcRenderer.invoke("files:open", path),
  removeFile: (path: string) => ipcRenderer.invoke("files:remove", path),
  replaceFile: (path: string) => ipcRenderer.invoke("files:replace", path),
  revealFile: (path: string) => ipcRenderer.invoke("files:reveal", path),
  fileMenu: (path: string) => ipcRenderer.invoke("files:menu", path),
  startFileDrag: (path: string) => ipcRenderer.send("files:start-drag", path),
  onStateChange: (callback: (state: unknown) => void) =>
    subscribe("state:changed", callback),
  onUpdateChange: (callback: (state: unknown) => void) =>
    subscribe("updates:changed", callback),
  onStats: (callback: (stats: unknown) => void) =>
    subscribe("stats:changed", callback),
  onWidthPreview: (callback: (width: number) => void) =>
    subscribe("panel:width-preview", callback),
});
