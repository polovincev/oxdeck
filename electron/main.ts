import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { promises as files } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  type Display,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from "electron";
import {
  panelWidths,
  recommendedUiScale,
  uiScales,
  metricIds as metricValues,
  windowCommands as windowCommandValues,
  maxColumns,
  placeWidget,
  type LayoutWidget,
  type MetricId,
  type PanelSide,
  type PanelWidth,
  type UiScale,
  type WindowCommand,
} from "../shared/layout.js";
import { getWindowBounds } from "./window-layout.js";
import {
  listKubernetesContexts,
  listKubernetesNamespaces,
  listKubernetesPods,
} from "./kubernetes.js";
import {
  buildKubernetesCommand,
  restoreKubernetesSettings,
} from "../shared/kubernetes.js";

type DisplaySnapshot = {
  id: number;
  label: string;
  internal: boolean;
  width: number;
  height: number;
};
type Geometry = { side: PanelSide; width: PanelWidth; scale: UiScale };
type Settings = {
  display: DisplaySnapshot | null;
  geometries: Record<string, Geometry>;
  layout: LayoutWidget[];
  launchAtLogin: boolean;
};
type NativeWindow = {
  pid: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Native Node addons cannot be loaded with a static TypeScript import from the packaged path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const windowManager = require(
  path.join(app.getAppPath(), "native/build/window_manager.node"),
) as {
  requestAccessibility(): boolean;
  getActiveWindow(): NativeWindow;
  setWindowBounds(bounds: NativeWindow): void;
};
const windowCommands = new Set<WindowCommand>(windowCommandValues);
const metrics = new Set<MetricId>(metricValues);
const defaultGeometry: Geometry = { side: "left", width: 70, scale: 1 };
const run = promisify(execFile);
const fallbackDragIcon = nativeImage
  .createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  )
  .resize({ width: 32, height: 32 });

let panel: BrowserWindow;
let settings: Settings;
let settingsPath = "";
let shelfPath = "";
let shelf: string[] = [];
let editing = false;
let manuallyHidden = false;
let waitingForDisplay = false;
let previewWidth: PanelWidth | null = null;
let previousCpu = cpuTimes();
const icons = new Map<string, string | null>();
const stats = {
  cpu: null as number | null,
  memory: null as number | null,
  battery: null as number | null,
  batteryTemperature: null as number | null,
  disk: null as number | null,
};

function isTrustedRendererUrl(url: string) {
  try {
    const renderer = process.env.OXDECK_RENDERER_URL;
    return renderer
      ? new URL(url).origin === new URL(renderer).origin
      : url ===
          pathToFileURL(path.join(app.getAppPath(), "dist/index.html")).href;
  } catch {
    return false;
  }
}

function isTrustedIpc(event: IpcMainEvent | IpcMainInvokeEvent) {
  return (
    event.senderFrame === event.sender.mainFrame &&
    isTrustedRendererUrl(event.senderFrame.url)
  );
}

function assertTrustedIpc(event: IpcMainInvokeEvent) {
  if (!isTrustedIpc(event)) {
    throw new Error("Blocked IPC from an untrusted renderer");
  }
}

function handle<T extends unknown[], R>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: T) => R,
) {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedIpc(event);
    return listener(event, ...(args as T));
  });
}

function on<T extends unknown[]>(
  channel: string,
  listener: (event: IpcMainEvent, ...args: T) => void,
) {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    if (isTrustedIpc(event)) {
      listener(event, ...(args as T));
    }
  });
}

function displaySnapshot(display: Display): DisplaySnapshot {
  return {
    id: display.id,
    label: display.label,
    internal: display.internal,
    width: display.size.width,
    height: display.size.height,
  };
}

function displayKey(display: DisplaySnapshot) {
  return `${display.label}|${display.internal}|${display.width}x${display.height}`;
}

function findDisplay(saved = settings.display) {
  if (!saved) {
    return null;
  }
  return (
    screen.getAllDisplays().find(({ id }) => id === saved.id) ??
    screen
      .getAllDisplays()
      .find(
        (display) =>
          display.label === saved.label &&
          display.internal === saved.internal &&
          display.size.width === saved.width &&
          display.size.height === saved.height,
      ) ??
    null
  );
}

function geometryFor(display: Display) {
  const geometry = settings.geometries[displayKey(displaySnapshot(display))];
  const fallback = {
    ...defaultGeometry,
    scale: recommendedUiScale(
      display.size.width,
      display.size.height,
      display.scaleFactor,
    ),
  };
  return geometry &&
    (geometry.side === "left" || geometry.side === "right") &&
    panelWidths.includes(geometry.width)
    ? {
        ...geometry,
        scale: uiScales.includes(geometry.scale)
          ? geometry.scale
          : fallback.scale,
      }
    : fallback;
}

function panelBounds(display: Display, geometry = geometryFor(display)) {
  const area = display.workArea;
  const width = Math.round((area.width * geometry.width) / 100);
  return {
    x: geometry.side === "left" ? area.x : area.x + area.width - width,
    y: area.y,
    width,
    height: area.height,
  };
}

function validDisplay(value: unknown): value is DisplaySnapshot {
  const item = value as Partial<DisplaySnapshot> | null;
  return Boolean(
    item &&
    typeof item.id === "number" &&
    typeof item.label === "string" &&
    typeof item.internal === "boolean" &&
    typeof item.width === "number" &&
    typeof item.height === "number",
  );
}

function sanitizeLayout(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  const layout: LayoutWidget[] = [];
  const ids = new Set<string>();
  const singletons = new Set<string>();

  for (const raw of value.slice(0, 100)) {
    const item = raw as Record<string, unknown>;
    if (
      !item ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      !Number.isInteger(item.x) ||
      !Number.isInteger(item.y) ||
      !Number.isInteger(item.w) ||
      !Number.isInteger(item.h)
    ) {
      continue;
    }

    const base = {
      id: item.id,
      x: item.x as number,
      y: item.y as number,
      w: item.w as number,
      h: item.h as number,
    };
    let widget: LayoutWidget | null = null;
    if (
      item.type === "app" &&
      base.w === 1 &&
      base.h === 1 &&
      typeof item.path === "string" &&
      path.isAbsolute(item.path) &&
      item.path.toLowerCase().endsWith(".app") &&
      typeof item.name === "string"
    ) {
      widget = {
        ...base,
        type: "app",
        path: item.path,
        name: item.name.slice(0, 80),
      };
    }
    if (
      item.type === "window" &&
      base.w === 1 &&
      base.h === 1 &&
      windowCommands.has(item.command as WindowCommand)
    ) {
      widget = {
        ...base,
        type: "window",
        command: item.command as WindowCommand,
      };
    }
    if (
      item.type === "metric" &&
      (base.w === 1 || base.w === 2) &&
      base.h === 1 &&
      metrics.has(item.metric as MetricId) &&
      !singletons.has(`metric:${String(item.metric)}`)
    ) {
      widget = { ...base, type: "metric", metric: item.metric as MetricId };
    }
    if (
      item.type === "files" &&
      base.w >= 2 &&
      base.h >= 2 &&
      base.w <= 10 &&
      base.h <= 20 &&
      !singletons.has("files")
    ) {
      widget = { ...base, type: "files" };
    }
    if (
      item.type === "kubernetes" &&
      (base.w === 1 || base.w === 2) &&
      base.h === 1 &&
      !singletons.has("kubernetes")
    ) {
      widget = { ...base, type: "kubernetes" };
    }
    if (widget) {
      const next = placeWidget(layout, widget, maxColumns, 100);
      if (next) {
        layout.splice(0, layout.length, ...next);
        ids.add(widget.id);
        if (widget.type === "metric") {
          singletons.add(`metric:${widget.metric}`);
        }
        if (widget.type === "files") {
          singletons.add("files");
        }
        if (widget.type === "kubernetes") {
          singletons.add("kubernetes");
        }
      }
    }
  }
  return layout;
}

function defaultLayout(): LayoutWidget[] {
  const finder = "/System/Library/CoreServices/Finder.app";
  const terminal = "/System/Applications/Utilities/Terminal.app";
  // ponytail: Chrome/Safari covers onboarding; query LaunchServices when exact default-browser detection matters.
  const browser = fs.existsSync("/Applications/Google Chrome.app")
    ? "/Applications/Google Chrome.app"
    : "/Applications/Safari.app";
  return [
    { id: "files", type: "files", x: 0, y: 0, w: 4, h: 4 },
    {
      id: "app-finder",
      type: "app",
      path: finder,
      name: "Finder",
      x: 4,
      y: 0,
      w: 1,
      h: 1,
    },
    {
      id: "app-terminal",
      type: "app",
      path: terminal,
      name: "Terminal",
      x: 5,
      y: 0,
      w: 1,
      h: 1,
    },
    {
      id: "app-browser",
      type: "app",
      path: browser,
      name: path.basename(browser, ".app"),
      x: 6,
      y: 0,
      w: 1,
      h: 1,
    },
    { id: "metric-cpu", type: "metric", metric: "cpu", x: 7, y: 0, w: 1, h: 1 },
    {
      id: "metric-memory",
      type: "metric",
      metric: "memory",
      x: 8,
      y: 0,
      w: 1,
      h: 1,
    },
    {
      id: "metric-battery",
      type: "metric",
      metric: "battery",
      x: 4,
      y: 1,
      w: 1,
      h: 1,
    },
    {
      id: "window-left",
      type: "window",
      command: "left",
      x: 5,
      y: 1,
      w: 1,
      h: 1,
    },
    {
      id: "window-right",
      type: "window",
      command: "right",
      x: 6,
      y: 1,
      w: 1,
      h: 1,
    },
    {
      id: "window-max",
      type: "window",
      command: "maximize",
      x: 7,
      y: 1,
      w: 1,
      h: 1,
    },
  ];
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await files.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(error);
    }
    return null;
  }
}

async function writeJson(filePath: string, value: unknown) {
  const temporary = `${filePath}.tmp`;
  await files.writeFile(temporary, JSON.stringify(value, null, 2));
  await files.rename(temporary, filePath);
}

async function loadData() {
  settingsPath = path.join(app.getPath("userData"), "settings.json");
  shelfPath = path.join(app.getPath("userData"), "file-shelf.json");
  const [savedSettings, savedShelf] = await Promise.all([
    readJson(settingsPath),
    readJson(shelfPath),
  ]);
  const saved = (savedSettings ?? {}) as Partial<Settings>;
  settings = {
    display: validDisplay(saved.display) ? saved.display : null,
    geometries:
      saved.geometries && typeof saved.geometries === "object"
        ? saved.geometries
        : {},
    layout: Array.isArray(saved.layout)
      ? sanitizeLayout(saved.layout)
      : defaultLayout(),
    launchAtLogin: saved.launchAtLogin === true,
  };
  shelf = Array.isArray(savedShelf)
    ? [
        ...new Set(
          savedShelf.filter(
            (item): item is string =>
              typeof item === "string" && path.isAbsolute(item),
          ),
        ),
      ]
    : [];
}

async function iconFor(filePath: string) {
  if (icons.has(filePath)) {
    return icons.get(filePath) ?? null;
  }
  try {
    let image = await app.getFileIcon(filePath, { size: "normal" });
    if (filePath.toLowerCase().endsWith(".app")) {
      const { stdout } = await run(
        "/usr/bin/plutil",
        [
          "-extract",
          "CFBundleIconFile",
          "raw",
          path.join(filePath, "Contents/Info.plist"),
        ],
        { encoding: "utf8", timeout: 2000 },
      );
      const name = stdout.trim();
      const iconPath = path.join(
        filePath,
        "Contents/Resources",
        path.extname(name) ? name : `${name}.icns`,
      );
      const png = path.join(
        app.getPath("temp"),
        `oxdeck-${createHash("sha1").update(iconPath).digest("hex")}.png`,
      );
      if (!fs.existsSync(png)) {
        await run(
          "/usr/bin/sips",
          ["-s", "format", "png", iconPath, "--out", png],
          { timeout: 3000 },
        );
      }
      const appIcon = nativeImage.createFromPath(png);
      if (!appIcon.isEmpty()) {
        image = appIcon.resize({ width: 64, height: 64 });
      }
    }
    const icon = image.toDataURL();
    icons.set(filePath, icon);
    return icon;
  } catch {
    icons.set(filePath, null);
    return null;
  }
}

async function describeLayout() {
  return Promise.all(
    settings.layout.map(async (widget) =>
      widget.type === "app"
        ? {
            ...widget,
            exists: fs.existsSync(widget.path),
            icon: await iconFor(widget.path),
          }
        : widget,
    ),
  );
}

async function state() {
  const selected = findDisplay();
  const display = selected ? displaySnapshot(selected) : settings.display;
  const geometry = selected ? geometryFor(selected) : defaultGeometry;
  return {
    firstRun: !settings.display,
    display,
    geometry,
    launchAtLogin: settings.launchAtLogin,
    displays: screen.getAllDisplays().map((item, index) => ({
      ...displaySnapshot(item),
      name:
        item.label ||
        `${item.internal ? "Встроенный экран" : "Монитор"} ${index + 1}`,
    })),
    layout: await describeLayout(),
  };
}

async function sendState() {
  if (panel?.isDestroyed() || panel?.webContents.isLoading()) {
    return;
  }
  panel.webContents.send("state:changed", await state());
}

async function applyPanel() {
  if (!panel || panel.isDestroyed()) {
    return;
  }
  const selected = findDisplay();

  if (settings.display && !selected) {
    waitingForDisplay = true;
    if (!panel.isMinimized()) {
      panel.minimize();
    }
    await sendState();
    return;
  }

  const display = selected ?? screen.getPrimaryDisplay();
  panel.setBounds(
    panelBounds(display, selected ? geometryFor(display) : defaultGeometry),
  );
  panel.setFocusable(editing || !settings.display);
  if (
    waitingForDisplay ||
    (!manuallyHidden && (!panel.isVisible() || panel.isMinimized()))
  ) {
    waitingForDisplay = false;
    if (panel.isMinimized()) {
      panel.restore();
    }
    if (settings.display) {
      panel.showInactive();
    } else {
      panel.show();
    }
  }
  if (!settings.display) {
    panel.focus();
  }
  await sendState();
}

function cpuTimes() {
  return os.cpus().reduce(
    (total, cpu) => ({
      idle: total.idle + cpu.times.idle,
      all:
        total.all +
        Object.values(cpu.times).reduce((sum, time) => sum + time, 0),
    }),
    { idle: 0, all: 0 },
  );
}

function updateCpu() {
  const next = cpuTimes();
  const idle = next.idle - previousCpu.idle;
  const all = next.all - previousCpu.all;
  previousCpu = next;
  stats.cpu = all ? Math.round((1 - idle / all) * 100) : 0;
}

function updateMemory() {
  execFile(
    "/usr/bin/memory_pressure",
    ["-Q"],
    { timeout: 2000 },
    (error, output) => {
      const free = Number(
        output?.match(/memory free percentage:\s*(\d+)%/)?.[1],
      );
      stats.memory = error || Number.isNaN(free) ? null : 100 - free;
    },
  );
}

function updatePower() {
  execFile(
    "/usr/sbin/ioreg",
    ["-r", "-c", "AppleSmartBattery", "-w0"],
    { timeout: 2000 },
    (error, output) => {
      const charge = Number(output?.match(/"CurrentCapacity" = (\d+)/)?.[1]);
      const temperature = Number(output?.match(/"Temperature" = (\d+)/)?.[1]);
      stats.battery = error || Number.isNaN(charge) ? null : charge;
      stats.batteryTemperature =
        error || !temperature ? null : Math.round(temperature / 10 - 273.15);
    },
  );
}

async function updateDisk() {
  try {
    const disk = await files.statfs("/");
    stats.disk = Math.round(
      (Number(disk.bavail) * Number(disk.bsize)) / 1024 ** 3,
    );
  } catch {
    stats.disk = null;
  }
}

function sendStats() {
  if (!panel?.isDestroyed() && !panel?.webContents.isLoading()) {
    updateCpu();
    panel.webContents.send("stats:changed", stats);
  }
}

async function shelfItems() {
  return Promise.all(
    shelf.map(async (filePath) => {
      let isDirectory = false;
      let exists = false;
      try {
        const info = await files.stat(filePath);
        isDirectory = info.isDirectory();
        exists = true;
      } catch {
        // Missing shelf entries stay visible so the user can replace them.
      }
      return {
        path: filePath,
        name: path.basename(filePath) || filePath,
        exists,
        isDirectory,
        icon: exists ? await iconFor(filePath) : null,
      };
    }),
  );
}

function isAvailableShelfItem(value: unknown): value is string {
  return (
    typeof value === "string" && shelf.includes(value) && fs.existsSync(value)
  );
}

async function scanApplications() {
  const found = new Set<string>();
  async function walk(directory: string, depth: number): Promise<void> {
    try {
      for (const entry of await files.readdir(directory, {
        withFileTypes: true,
      })) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        const target = path.join(directory, entry.name);
        if (entry.name.toLowerCase().endsWith(".app")) {
          found.add(target);
        } else if (entry.isDirectory() && depth) {
          await walk(target, depth - 1);
        }
      }
    } catch {
      // Application folders are optional and may be unreadable.
    }
  }
  await Promise.all([
    walk("/Applications", 2),
    walk("/System/Applications", 2),
    walk(path.join(os.homedir(), "Applications"), 2),
  ]);
  return [...found].sort().map((appPath) => ({
    path: appPath,
    name: path.basename(appPath, ".app"),
    exists: true,
    icon: null,
  }));
}

function arrangeWindow(command: unknown) {
  try {
    if (!windowCommands.has(command as WindowCommand)) {
      throw new Error("Неизвестная команда окна");
    }
    if (!windowManager.requestAccessibility()) {
      throw new Error(
        "Разрешите OxDeck управление в Системных настройках → Универсальный доступ",
      );
    }
    const current = windowManager.getActiveWindow();
    const display = screen.getDisplayMatching(current);
    if (display.id === findDisplay()?.id) {
      throw new Error("Выберите окно на другом мониторе");
    }
    const bounds = getWindowBounds(command as WindowCommand, display.workArea);
    windowManager.setWindowBounds({ ...current, ...bounds });
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error ? error.message : "Не удалось изменить окно",
    };
  }
}

function createPanel() {
  panel = new BrowserWindow({
    width: 720,
    height: 900,
    show: false,
    frame: false,
    roundedCorners: false,
    backgroundColor: "#101114",
    focusable: false,
    enableLargerThanScreen: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  panel.setAlwaysOnTop(true, "floating");
  panel.setVisibleOnAllWorkspaces(false);
  panel.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });
  panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const renderer = process.env.OXDECK_RENDERER_URL;
  void (renderer
    ? panel.loadURL(renderer)
    : panel.loadFile(path.join(app.getAppPath(), "dist/index.html")));
  panel.webContents.on("did-finish-load", () => void applyPanel());
}

handle("state:get", state);
handle("kubernetes:contexts", listKubernetesContexts);
handle("kubernetes:namespaces", (_event, context: unknown) =>
  listKubernetesNamespaces(context),
);
handle("kubernetes:pods", (_event, context: unknown, namespace: unknown) =>
  listKubernetesPods(context, namespace),
);
handle("kubernetes:copy", async (_event, value: unknown) => {
  const result = buildKubernetesCommand(restoreKubernetesSettings(value));
  if (result.error) {
    return { ok: false as const, message: result.error };
  }
  await clipboard.writeText(result.command);
  return { ok: true as const };
});
handle("settings:save", async (_event, value: unknown) => {
  const next = value as {
    displayId?: unknown;
    side?: unknown;
    width?: unknown;
    scale?: unknown;
    launchAtLogin?: unknown;
  };
  const display = screen
    .getAllDisplays()
    .find(({ id }) => id === next.displayId);
  if (
    !display ||
    (next.side !== "left" && next.side !== "right") ||
    !panelWidths.includes(next.width as PanelWidth) ||
    !uiScales.includes(next.scale as UiScale)
  ) {
    return { ok: false as const, message: "Проверьте настройки панели" };
  }
  const snapshot = displaySnapshot(display);
  settings.display = snapshot;
  settings.geometries[displayKey(snapshot)] = {
    side: next.side,
    width: next.width as PanelWidth,
    scale: next.scale as UiScale,
  };
  settings.launchAtLogin = next.launchAtLogin === true;
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  }
  await writeJson(settingsPath, settings);
  editing = false;
  manuallyHidden = false;
  await applyPanel();
  return { ok: true as const, state: await state() };
});
handle("layout:save", async (_event, value: unknown) => {
  if (!Array.isArray(value)) {
    return { ok: false as const, message: "Некорректная раскладка" };
  }
  const layout = sanitizeLayout(value);
  if (layout.length !== value.length) {
    return { ok: false as const, message: "Раскладка повреждена" };
  }
  settings.layout = layout;
  await writeJson(settingsPath, settings);
  await sendState();
  return { ok: true as const };
});
handle("apps:list", scanApplications);
handle("apps:pick", async () => {
  const result = await dialog.showOpenDialog(panel, {
    title: "Выберите приложение",
    properties: ["openFile"],
    filters: [{ name: "Приложения macOS", extensions: ["app"] }],
  });
  const appPath = result.filePaths[0];
  return result.canceled || !appPath
    ? null
    : { path: appPath, name: path.basename(appPath, ".app") };
});
handle("apps:open", async (_event, appPath: unknown) => {
  if (
    typeof appPath !== "string" ||
    !path.isAbsolute(appPath) ||
    !appPath.toLowerCase().endsWith(".app")
  ) {
    return { ok: false as const, message: "Некорректное приложение" };
  }
  const error = await shell.openPath(appPath);
  return error ? { ok: false as const, message: error } : { ok: true as const };
});
handle("windows:arrange", (_event, command) => arrangeWindow(command));
handle("files:list", shelfItems);
handle("files:add", async (_event, candidates: unknown) => {
  if (!Array.isArray(candidates)) {
    return { ok: false as const, message: "Некорректный список файлов" };
  }
  let added = 0;
  for (const candidate of candidates.reverse()) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
      continue;
    }
    const filePath = path.normalize(candidate);
    if (!shelf.includes(filePath) && fs.existsSync(filePath)) {
      shelf.unshift(filePath);
      added += 1;
    }
  }
  if (added) {
    await writeJson(shelfPath, shelf);
  }
  return { ok: true as const, added, items: await shelfItems() };
});
handle("files:open", async (_event, filePath: unknown) => {
  if (!isAvailableShelfItem(filePath)) {
    return { ok: false as const, message: "Файл недоступен" };
  }
  const error = await shell.openPath(filePath);
  return error ? { ok: false as const, message: error } : { ok: true as const };
});
handle("files:remove", async (_event, filePath: unknown) => {
  if (typeof filePath === "string") {
    shelf = shelf.filter((item) => item !== filePath);
  }
  await writeJson(shelfPath, shelf);
  return shelfItems();
});
handle("files:replace", async (_event, oldPath: unknown) => {
  if (typeof oldPath !== "string" || !shelf.includes(oldPath)) {
    return shelfItems();
  }
  const result = await dialog.showOpenDialog(panel, {
    properties: ["openFile", "openDirectory"],
  });
  const replacement = result.filePaths[0];
  if (!result.canceled && replacement && !shelf.includes(replacement)) {
    shelf[shelf.indexOf(oldPath)] = replacement;
    icons.delete(oldPath);
    await writeJson(shelfPath, shelf);
  }
  return shelfItems();
});
handle(
  "files:menu",
  (_event, filePath: unknown) =>
    new Promise<"reveal" | "replace" | "remove" | null>((resolve) => {
      if (typeof filePath !== "string" || !shelf.includes(filePath)) {
        resolve(null);
        return;
      }
      const template: MenuItemConstructorOptions[] = [
        {
          label: "Показать в Finder",
          enabled: fs.existsSync(filePath),
          click: () => resolve("reveal"),
        },
        { label: "Заменить…", click: () => resolve("replace") },
        { type: "separator" },
        { label: "Убрать с полки", click: () => resolve("remove") },
      ];
      Menu.buildFromTemplate(template).popup({
        window: panel,
        callback: () => resolve(null),
      });
    }),
);
handle("files:reveal", (_event, filePath: unknown) => {
  if (!isAvailableShelfItem(filePath)) {
    return { ok: false as const, message: "Файл недоступен" };
  }
  shell.showItemInFolder(filePath);
  return { ok: true as const };
});
on("files:start-drag", (event, filePath: unknown) => {
  if (!isAvailableShelfItem(filePath)) {
    return;
  }
  event.sender.startDrag({
    file: filePath,
    icon: icons.get(filePath) || fallbackDragIcon,
  });
});
on("panel:editing", (_event, value: unknown) => {
  editing = value === true;
  panel.setFocusable(editing || !settings.display);
  if (editing) {
    panel.show();
    panel.focus();
  }
});
on("panel:minimize", () => {
  editing = false;
  manuallyHidden = true;
  panel.setFocusable(false);
  panel.minimize();
});
on("panel:resize", (_event, screenX: unknown) => {
  const display = findDisplay();
  if (!display || typeof screenX !== "number") {
    return;
  }
  const area = display.workArea;
  const geometry = geometryFor(display);
  const pixels =
    geometry.side === "left" ? screenX - area.x : area.x + area.width - screenX;
  const percent = (pixels / area.width) * 100;
  const nearest = panelWidths.reduce((best, value) =>
    Math.abs(value - percent) < Math.abs(best - percent) ? value : best,
  );
  if (previewWidth === nearest) {
    return;
  }
  previewWidth = nearest;
  panel.setBounds(panelBounds(display, { ...geometry, width: nearest }));
  panel.webContents.send("panel:width-preview", nearest);
});
handle("panel:resize-finish", async () => {
  const display = findDisplay();
  if (display && previewWidth) {
    const key = displayKey(displaySnapshot(display));
    settings.geometries[key] = { ...geometryFor(display), width: previewWidth };
    await writeJson(settingsPath, settings);
  }
  previewWidth = null;
  await sendState();
});

void app.whenReady().then(async () => {
  if (!app.isPackaged) {
    app.dock?.setIcon(path.join(app.getAppPath(), "assets/oxdeck.png"));
  }
  await loadData();
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
  createPanel();
  screen.on("display-added", () => void applyPanel());
  screen.on("display-removed", () => void applyPanel());
  screen.on("display-metrics-changed", () => void applyPanel());
  updateMemory();
  updatePower();
  void updateDisk();
  setInterval(sendStats, 2000).unref();
  setInterval(updateMemory, 5000).unref();
  setInterval(updatePower, 10_000).unref();
  setInterval(() => void updateDisk(), 30_000).unref();
});

app.on("activate", () => {
  manuallyHidden = false;
  void applyPanel();
});
app.on("window-all-closed", () => app.quit());
