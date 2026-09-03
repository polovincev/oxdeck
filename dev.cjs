const { spawn } = require("node:child_process");
const { watch } = require("node:fs");

const electron = require("electron");

let electronProcess;
let rendererServer;
let rendererUrl;
let restartTimer;
let restarting = false;

function startElectron() {
  electronProcess = spawn(electron, ["."], {
    cwd: __dirname,
    stdio: "inherit",
    env: { ...process.env, OXDECK_RENDERER_URL: rendererUrl },
  });

  electronProcess.once("exit", async () => {
    electronProcess = undefined;
    if (restarting) {
      restarting = false;
      startElectron();
      return;
    }

    await rendererServer.close();
    process.exit(0);
  });
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!electronProcess) return;
    restarting = true;
    console.log("\n↻ Electron-код изменён — перезапускаю приложение…");
    electronProcess.kill();
  }, 150);
}

async function start() {
  const { createServer } = await import("vite");
  rendererServer = await createServer();
  await rendererServer.listen();
  rendererServer.printUrls();
  rendererUrl = rendererServer.resolvedUrls.local[0];

  watch(__dirname, (_event, filename) => {
    if (filename === "main.cjs" || filename === "preload.cjs") {
      scheduleRestart();
    }
  });

  console.log("React-интерфейс обновляется через Vite без перезапуска окна.");
  startElectron();
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
