const {
    app,
    BrowserWindow,
    ipcMain,
    nativeImage,
    screen,
    shell,
} = require("electron/main");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { getWindowBounds } = require("./window-layout.cjs");
const windowManager = require("./native/build/window_manager.node");

const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 320;
const HOT_ZONE_WIDTH = 260;
const HOT_ZONE_HEIGHT = 15;
const HOVER_DELAY = 300;
const HIDE_DELAY = 450;
const CLOSE_ANIMATION_DURATION = 240;
const DEFAULT_SETTINGS = { mode: "compact", display: null };

// Здесь можно менять или добавлять запускаемые приложения.
const applications = {
    chrome: "/Applications/Google Chrome.app",
    finder: os.homedir(),
    terminal: "/System/Applications/Utilities/Terminal.app",
    vscode: "/Applications/Visual Studio Code.app",
};

let panel;
let activeMode = "compact";
let outsideSince = 0;
let hoverStartedAt = 0;
let closeTimer;
let previousCpuTimes = readCpuTimes();
let batteryTemperature = null;
let memoryUsage = null;
let fileShelf = [];
let fileShelfPath;
let shelfWrite = Promise.resolve();
let settings = DEFAULT_SETTINGS;
let settingsPath;
let settingsWrite = Promise.resolve();
const fileIcons = new Map();
const fallbackDragIcon = nativeImage
    .createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    )
    .resize({ width: 32, height: 32 });

async function loadFileShelf() {
    fileShelfPath = path.join(app.getPath("userData"), "file-shelf.json");

    try {
        const saved = JSON.parse(
            await fsPromises.readFile(fileShelfPath, "utf8"),
        );
        fileShelf = Array.isArray(saved)
            ? [
                  ...new Set(
                      saved
                          .filter(
                              (item) =>
                                  typeof item === "string" &&
                                  path.isAbsolute(item),
                          )
                          .map(path.normalize),
                  ),
              ]
            : [];
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Не удалось загрузить файловую полку:", error);
        }
        fileShelf = [];
    }
}

async function loadSettings() {
    settingsPath = path.join(app.getPath("userData"), "settings.json");

    try {
        const saved = JSON.parse(await fsPromises.readFile(settingsPath, "utf8"));
        settings = {
            mode: saved?.mode === "workspace" ? "workspace" : "compact",
            display:
                saved?.display && typeof saved.display.id === "number"
                    ? saved.display
                    : null,
        };
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Не удалось загрузить настройки:", error);
        }
        settings = DEFAULT_SETTINGS;
    }
}

function saveSettings() {
    const temporaryPath = `${settingsPath}.tmp`;
    const snapshot = JSON.stringify(settings, null, 2);

    settingsWrite = settingsWrite
        .catch(() => {})
        .then(async () => {
            await fsPromises.writeFile(temporaryPath, snapshot);
            await fsPromises.rename(temporaryPath, settingsPath);
        });

    return settingsWrite;
}

async function arrangeActiveWindow(command) {
    try {
        if (!windowManager.requestAccessibility()) {
            return {
                ok: false,
                message:
                    "Разрешите OxDeck управлять компьютером: Системные настройки → Конфиденциальность и безопасность → Универсальный доступ",
            };
        }
        const currentWindow = windowManager.getActiveWindow();
        const display = screen.getPrimaryDisplay();
        const bounds = getWindowBounds(command, display.workArea);
        windowManager.setWindowBounds({ ...currentWindow, ...bounds });
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            message: error.message || "Не удалось изменить активное окно",
        };
    }
}

function saveFileShelf() {
    const snapshot = JSON.stringify(fileShelf, null, 2);
    const temporaryPath = `${fileShelfPath}.tmp`;

    shelfWrite = shelfWrite
        .catch(() => {})
        .then(async () => {
            await fsPromises.writeFile(temporaryPath, snapshot);
            await fsPromises.rename(temporaryPath, fileShelfPath);
        });

    return shelfWrite;
}

async function describeShelfItem(filePath) {
    let stats;

    try {
        stats = await fsPromises.stat(filePath);
    } catch {
        fileIcons.delete(filePath);
        return {
            path: filePath,
            name: path.basename(filePath) || filePath,
            exists: false,
            isDirectory: false,
            icon: null,
        };
    }

    try {
        const icon = await app.getFileIcon(filePath, { size: "normal" });
        fileIcons.set(filePath, icon);
    } catch {
        fileIcons.delete(filePath);
    }

    return {
        path: filePath,
        name: path.basename(filePath) || filePath,
        exists: true,
        isDirectory: stats.isDirectory(),
        icon: fileIcons.get(filePath)?.toDataURL() || null,
    };
}

function getShelfItems() {
    return Promise.all(fileShelf.map(describeShelfItem));
}

function readCpuTimes() {
    return os.cpus().reduce(
        (result, cpu) => {
            result.idle += cpu.times.idle;
            result.total += Object.values(cpu.times).reduce(
                (total, time) => total + time,
                0,
            );
            return result;
        },
        { idle: 0, total: 0 },
    );
}

function readCpuLoad() {
    const current = readCpuTimes();
    const idle = current.idle - previousCpuTimes.idle;
    const total = current.total - previousCpuTimes.total;
    previousCpuTimes = current;
    return total > 0 ? Math.round((1 - idle / total) * 100) : 0;
}

function updateBatteryTemperature() {
    execFile(
        "/usr/sbin/ioreg",
        ["-r", "-c", "AppleSmartBattery", "-w0"],
        { encoding: "utf8", timeout: 2000 },
        (error, output) => {
            const raw = Number(output?.match(/"Temperature" = (\d+)/)?.[1]);
            batteryTemperature =
                error || !raw ? null : Math.round(raw / 10 - 273.15);
        },
    );
}

function updateMemoryUsage() {
    execFile(
        "/usr/bin/memory_pressure",
        ["-Q"],
        { encoding: "utf8", timeout: 2000 },
        (error, output) => {
            const free = Number(
                output?.match(/memory free percentage:\s*(\d+)%/)?.[1],
            );
            memoryUsage = error || Number.isNaN(free) ? null : 100 - free;
        },
    );
}

function sendSystemStats() {
    if (!panel || panel.isDestroyed() || panel.webContents.isLoading()) return;

    panel.webContents.send("system:stats", {
        cpu: readCpuLoad(),
        memory: memoryUsage,
        batteryTemperature,
    });
}

function contains(bounds, point) {
    return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    );
}

function getPanelBounds(display) {
    return {
        x: Math.round(
            display.bounds.x + (display.bounds.width - PANEL_WIDTH) / 2,
        ),
        y: display.bounds.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    };
}

function getWorkspaceBounds(display) {
    return {
        ...display.workArea,
        width: Math.floor(display.workArea.width / 2),
    };
}

function rememberDisplay(display) {
    return {
        id: display.id,
        label: display.label,
        internal: display.internal,
        width: display.size.width,
        height: display.size.height,
    };
}

function findSelectedDisplay() {
    if (!settings.display) return null;

    const displays = screen.getAllDisplays();
    return (
        displays.find((display) => display.id === settings.display.id) ||
        displays.find(
            (display) =>
                settings.display.label &&
                display.label === settings.display.label &&
                display.internal === settings.display.internal &&
                display.size.width === settings.display.width &&
                display.size.height === settings.display.height,
        ) ||
        null
    );
}

function getSettingsState() {
    const selected = findSelectedDisplay();
    const targetAvailable = Boolean(selected);

    return {
        settings: {
            mode: settings.mode,
            display: selected
                ? rememberDisplay(selected)
                : settings.display && { ...settings.display },
        },
        displays: screen.getAllDisplays().map((display, index) => ({
            ...rememberDisplay(display),
            name:
                display.label ||
                `${display.internal ? "Встроенный экран" : "Монитор"} ${index + 1}`,
        })),
        activeMode:
            settings.mode === "workspace" && targetAvailable
                ? "workspace"
                : "compact",
        targetAvailable,
    };
}

function sendSettingsState() {
    if (!panel || panel.isDestroyed() || panel.webContents.isLoading()) return;
    panel.webContents.send("settings:changed", getSettingsState());
}

function applyPanelMode() {
    if (!panel || panel.isDestroyed()) return;

    const selected = findSelectedDisplay();
    const nextMode =
        settings.mode === "workspace" && selected ? "workspace" : "compact";
    const wasWorkspace = activeMode === "workspace";
    activeMode = nextMode;
    clearTimeout(closeTimer);
    closeTimer = undefined;
    hoverStartedAt = 0;
    outsideSince = 0;

    if (nextMode === "workspace") {
        panel.setBounds(getWorkspaceBounds(selected));
        panel.showInactive();
    } else if (wasWorkspace) {
        panel.hide();
    }

    sendSettingsState();
}

function isInHotZone(display, point) {
    const x = display.bounds.x + (display.bounds.width - HOT_ZONE_WIDTH) / 2;
    return contains(
        {
            x,
            y: display.bounds.y,
            width: HOT_ZONE_WIDTH,
            height: HOT_ZONE_HEIGHT,
        },
        point,
    );
}

function showPanel(display = screen.getPrimaryDisplay()) {
    if (activeMode === "workspace") return;
    clearTimeout(closeTimer);
    closeTimer = undefined;
    hoverStartedAt = 0;
    panel.setBounds(getPanelBounds(display));
    panel.showInactive();
    panel.webContents.send("panel:show");
    outsideSince = 0;
}

function hidePanel() {
    if (activeMode === "workspace" || closeTimer || !panel.isVisible()) return;

    panel.webContents.send("panel:hide");
    closeTimer = setTimeout(() => {
        panel.hide();
        closeTimer = undefined;
        outsideSince = 0;
    }, CLOSE_ANIMATION_DURATION);
}

function watchCursor() {
    if (activeMode === "workspace") return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const inHotZone = isInHotZone(display, point);

    if (!panel.isVisible()) {
        if (!inHotZone) {
            hoverStartedAt = 0;
            return;
        }

        hoverStartedAt ||= Date.now();
        if (Date.now() - hoverStartedAt >= HOVER_DELAY) showPanel(display);
        return;
    }

    hoverStartedAt = 0;
    if (inHotZone || contains(panel.getBounds(), point)) {
        if (closeTimer) showPanel(display);
        outsideSince = 0;
        return;
    }

    outsideSince ||= Date.now();
    if (Date.now() - outsideSince >= HIDE_DELAY) hidePanel();
}

function createPanel() {
    panel = new BrowserWindow({
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        show: false,
        frame: false,
        roundedCorners: false,
        transparent: true,
        focusable: false,
        enableLargerThanScreen: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    panel.setAlwaysOnTop(true, "pop-up-menu");
    panel.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
    });
    if (process.env.OXDECK_RENDERER_URL) {
        panel.loadURL(process.env.OXDECK_RENDERER_URL);
    } else {
        panel.loadFile(path.join(__dirname, "dist", "index.html"));
    }

    panel.webContents.on("did-finish-load", applyPanelMode);
}

ipcMain.handle("apps:open", async (_event, id) => {
    const target = applications[id];
    if (!target) return { ok: false, message: "Неизвестное приложение" };

    const error = await shell.openPath(target);
    if (error) return { ok: false, message: error };

    if (activeMode === "compact") hidePanel();
    return { ok: true };
});

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("windows:arrange", (_event, command) =>
    arrangeActiveWindow(command),
);

ipcMain.handle("panel:focus-settings", () => {
    panel.setFocusable(true);
    panel.show();
    panel.focus();
});

ipcMain.on("panel:release-focus", () => {
    panel.setFocusable(false);
});

ipcMain.handle("settings:get", () => getSettingsState());

ipcMain.handle("settings:save", async (_event, nextSettings) => {
    const mode = nextSettings?.mode;
    if (mode !== "compact" && mode !== "workspace") {
        return { ok: false, message: "Неизвестный режим" };
    }

    const display = screen
        .getAllDisplays()
        .find((candidate) => candidate.id === nextSettings.displayId);
    if (mode === "workspace" && !display) {
        return { ok: false, message: "Выбранный монитор недоступен" };
    }

    settings = {
        mode,
        display: display ? rememberDisplay(display) : settings.display,
    };
    await saveSettings();
    applyPanelMode();
    return { ok: true, state: getSettingsState() };
});

ipcMain.handle("files:list", () => getShelfItems());

ipcMain.handle("files:add", async (_event, candidates) => {
    if (!Array.isArray(candidates)) {
        return { ok: false, message: "Некорректный список файлов" };
    }

    let added = 0;

    for (const candidate of candidates) {
        if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
            continue;
        }

        const filePath = path.normalize(candidate);
        if (fileShelf.includes(filePath) || !fs.existsSync(filePath)) continue;

        fileShelf.push(filePath);
        added += 1;
    }

    if (added) await saveFileShelf();

    return {
        ok: true,
        added,
        items: await getShelfItems(),
    };
});

ipcMain.handle("files:remove", async (_event, filePath) => {
    const index = fileShelf.indexOf(filePath);
    if (index === -1) return getShelfItems();

    fileShelf.splice(index, 1);
    fileIcons.delete(filePath);
    await saveFileShelf();
    return getShelfItems();
});

ipcMain.handle("files:reveal", (_event, filePath) => {
    if (!fileShelf.includes(filePath) || !fs.existsSync(filePath)) {
        return { ok: false, message: "Файл больше недоступен" };
    }

    shell.showItemInFolder(filePath);
    return { ok: true };
});

ipcMain.on("files:start-drag", (event, filePath) => {
    if (!fileShelf.includes(filePath) || !fs.existsSync(filePath)) return;

    event.sender.startDrag({
        file: filePath,
        icon: fileIcons.get(filePath) || fallbackDragIcon,
    });
});

ipcMain.on("panel:quit", () => app.quit());

app.whenReady().then(async () => {
    if (process.platform === "darwin") app.dock.hide();
    await Promise.all([loadFileShelf(), loadSettings()]);
    createPanel();
    screen.on("display-added", applyPanelMode);
    screen.on("display-removed", applyPanelMode);
    screen.on("display-metrics-changed", applyPanelMode);
    updateBatteryTemperature();
    updateMemoryUsage();
    setInterval(watchCursor, 80);
    setInterval(sendSystemStats, 1000);
    setInterval(updateBatteryTemperature, 5000);
    setInterval(updateMemoryUsage, 5000);
});

app.on("window-all-closed", () => app.quit());
