import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("oxdeck", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  saveLayout: (layout: unknown) => ipcRenderer.invoke("layout:save", layout),
  listApplications: () => ipcRenderer.invoke("apps:list"),
  pickApplication: () => ipcRenderer.invoke("apps:pick"),
  openApp: (path: string) => ipcRenderer.invoke("apps:open", path),
  arrangeWindow: (command: string) => ipcRenderer.invoke("windows:arrange", command),
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
  onStateChange: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onStats: (callback: (stats: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, stats: unknown) => callback(stats);
    ipcRenderer.on("stats:changed", listener);
    return () => ipcRenderer.removeListener("stats:changed", listener);
  },
  onWidthPreview: (callback: (width: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, width: number) => callback(width);
    ipcRenderer.on("panel:width-preview", listener);
    return () => ipcRenderer.removeListener("panel:width-preview", listener);
  },
});
