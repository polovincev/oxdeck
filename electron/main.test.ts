import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import type { Rectangle } from "electron";

const requireModule = createRequire(__filename);
const primary = {
  id: 1,
  label: "Built-in",
  internal: true,
  size: { width: 1440, height: 900 },
  scaleFactor: 2,
  workArea: { x: 0, y: 24, width: 1440, height: 876 },
};
const target = {
  id: 42,
  label: "Touchscreen",
  internal: false,
  size: { width: 1920, height: 1080 },
  scaleFactor: 1,
  workArea: { x: 1440, y: 24, width: 1920, height: 1056 },
};

class FakePanel extends EventEmitter {
  bounds: Rectangle = { ...primary.workArea };
  minimized = false;
  visible = false;
  webContents = Object.assign(new EventEmitter(), {
    isLoading: () => false,
    send: () => {},
    setWindowOpenHandler: () => {},
  });

  isDestroyed() {
    return false;
  }
  isVisible() {
    return this.visible && !this.minimized;
  }
  isMinimized() {
    return this.minimized;
  }
  getBounds() {
    return this.bounds;
  }
  setBounds(bounds: Rectangle) {
    const moved = this.bounds.x !== bounds.x || this.bounds.y !== bounds.y;
    this.bounds = { ...bounds };
    if (moved) {
      this.emit("moved");
    }
  }
  minimize() {
    this.minimized = true;
  }
  restore() {
    this.minimized = false;
    this.visible = true;
    this.bounds = { ...primary.workArea };
    this.emit("restore");
  }
  showInactive() {
    this.visible = true;
  }
  show() {
    this.visible = true;
  }
  focus() {}
  setFocusable() {}
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  loadFile() {
    return Promise.resolve();
  }
}

function harness() {
  const root = path.resolve(__dirname, "../..");
  const screen = {
    displays: [primary, target],
    getAllDisplays() {
      return this.displays;
    },
    getPrimaryDisplay: () => primary,
    getDisplayMatching(bounds: Rectangle) {
      return (
        this.displays.find(
          ({ workArea }) =>
            bounds.x >= workArea.x && bounds.x < workArea.x + workArea.width,
        ) ?? primary
      );
    },
  };
  const ipcMain = Object.assign(new EventEmitter(), { handle: () => {} });
  const electron = {
    app: {
      getAppPath: () => root,
      whenReady: () => new Promise(() => {}),
      on: () => {},
    },
    BrowserWindow: FakePanel,
    ipcMain,
    nativeImage: { createFromDataURL: () => ({ resize: () => ({}) }) },
    screen,
  };
  const module = {
    exports: {} as {
      initialize: (value: unknown) => FakePanel;
      applyPanel: () => Promise<void>;
    },
  };
  // Exercise the real main-process logic without starting Electron or native services.
  runInNewContext(
    readFileSync(path.join(__dirname, "main.js"), "utf8") +
      `
module.exports = {
  initialize(value) { settings = value; createPanel(); return panel; },
  applyPanel
};
`,
    {
      module,
      exports: module.exports,
      __dirname,
      process: { env: {} },
      console,
      URL,
      require: (name: string): unknown => {
        if (name === "electron") {
          return electron;
        }
        if (
          name.endsWith("window_manager.node") ||
          name === "./updates.js" ||
          name === "./rewrite.js"
        ) {
          return {};
        }
        return requireModule(name) as unknown;
      },
    },
  );
  const settings = {
    display: {
      id: 42,
      label: "Touchscreen",
      internal: false,
      width: 1920,
      height: 1080,
    },
    geometries: {
      "Touchscreen|false|1920x1080": { side: "right", width: 60, scale: 1.25 },
    },
    layout: [],
    launchAtLogin: false,
  };
  const api = module.exports;
  const frame = { url: pathToFileURL(path.join(root, "dist/index.html")).href };
  return {
    screen,
    settings,
    panel: api.initialize(settings),
    apply: api.applyPanel,
    minimize: () =>
      ipcMain.emit("panel:minimize", {
        senderFrame: frame,
        sender: { mainFrame: frame },
      }),
  };
}

void test("panel waits for its display and reconnects without losing settings", async () => {
  const app = harness();
  const saved = JSON.stringify(app.settings);
  app.screen.displays = [primary];
  await app.apply();
  assert.equal(app.panel.isMinimized(), true);
  app.panel.restore();
  assert.equal(app.panel.isMinimized(), true);

  const reconnected = {
    ...target,
    id: 84,
    size: { width: 1280, height: 720 },
    workArea: { x: -1280, y: 24, width: 1280, height: 696 },
  };
  app.screen.displays = [primary, reconnected];
  await app.apply();
  assert.equal(app.panel.isVisible(), true);
  assert.deepEqual(app.panel.bounds, {
    x: -768,
    y: 24,
    width: 768,
    height: 696,
  });
  assert.equal(JSON.stringify(app.settings), saved);
});

void test("manual minimize lasts until restore and does not leave a stale flag", async () => {
  const app = harness();
  await app.apply();
  app.minimize();
  await app.apply();
  assert.equal(app.panel.isMinimized(), true);
  app.panel.restore();
  assert.deepEqual(app.panel.bounds, {
    x: 2208,
    y: 24,
    width: 1152,
    height: 1056,
  });
  app.panel.minimize();
  await app.apply();
  assert.equal(app.panel.isVisible(), true);
});

void test("system moves return the panel to its display without undoing width changes", async () => {
  const app = harness();
  await app.apply();
  const pinned = { ...app.panel.bounds };
  app.panel.setBounds(primary.workArea);
  assert.deepEqual(app.panel.bounds, pinned);
  const resized = { ...pinned, x: 2400, width: 960 };
  app.panel.setBounds(resized);
  assert.deepEqual(app.panel.bounds, resized);
});
