const { contextBridge, ipcRenderer, webUtils } = require("electron/renderer");

contextBridge.exposeInMainWorld("oxdeck", {
  openApp: (id) => ipcRenderer.invoke("apps:open", id),
  getVersion: () => ipcRenderer.invoke("app:version"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  listFiles: () => ipcRenderer.invoke("files:list"),
  addFiles: (paths) => ipcRenderer.invoke("files:add", paths),
  removeFile: (path) => ipcRenderer.invoke("files:remove", path),
  revealFile: (path) => ipcRenderer.invoke("files:reveal", path),
  startFileDrag: (path) => ipcRenderer.send("files:start-drag", path),
  onShow: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("panel:show", listener);
    return () => ipcRenderer.removeListener("panel:show", listener);
  },
  onHide: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("panel:hide", listener);
    return () => ipcRenderer.removeListener("panel:hide", listener);
  },
  onStats: (callback) => {
    const listener = (_event, stats) => callback(stats);
    ipcRenderer.on("system:stats", listener);
    return () => ipcRenderer.removeListener("system:stats", listener);
  },
  quit: () => ipcRenderer.send("panel:quit"),
});
