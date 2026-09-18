import { createHash, randomBytes } from "node:crypto";
import { createReadStream, promises as files } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { app, autoUpdater, net } from "electron";
import type { UpdateState } from "../shared/updates.js";
import {
  parseCachedUpdate,
  selectReleaseUpdate,
  type ReleaseUpdate,
} from "./update-release.js";

const checkInterval = 6 * 60 * 60 * 1000;
const releaseEndpoint =
  "https://api.github.com/repos/polovincev/oxdeck/releases/latest";
const enabled =
  app.isPackaged &&
  process.platform === "darwin" &&
  ["arm64", "x64"].includes(process.arch);
let state: UpdateState = {
  status: enabled ? "idle" : "disabled",
  currentVersion: app.getVersion(),
  version: null,
  progress: null,
  message: enabled
    ? "Проверка обновлений ещё не выполнялась."
    : "Обновления доступны в установленной версии для macOS.",
};
let notify: (state: UpdateState) => void = () => {};
let checking: Promise<void> | undefined;
let pending: ReleaseUpdate | null = null;

function cachePaths() {
  const directory = path.join(app.getPath("userData"), "updates");
  return {
    directory,
    archive: path.join(directory, "pending.zip"),
    partial: path.join(directory, "pending.zip.part"),
    metadata: path.join(directory, "pending.json"),
  };
}

function change(next: Partial<UpdateState>) {
  state = { ...state, ...next };
  notify(state);
}

export function getUpdateState(): UpdateState {
  return state;
}

async function verifyArchive(archive: string, release: ReleaseUpdate) {
  if ((await files.stat(archive)).size !== release.size) {
    throw new Error("Размер скачанного обновления не совпадает с релизом.");
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) {
    hash.update(chunk as Buffer);
  }
  if (hash.digest("hex") !== release.sha256) {
    throw new Error("Скачанное обновление повреждено. Повторите проверку.");
  }
}

async function restorePending() {
  const paths = cachePaths();
  try {
    const metadata: unknown = JSON.parse(
      await files.readFile(paths.metadata, "utf8"),
    );
    const release = parseCachedUpdate(
      metadata,
      state.currentVersion,
      process.arch,
    );
    if (release) {
      await verifyArchive(paths.archive, release);
      return release;
    }
  } catch {
    // A missing, outdated or incomplete download is replaced on the next check.
  }
  await discardPending();
  return null;
}

async function discardPending() {
  const paths = cachePaths();
  await Promise.all([
    files.rm(paths.metadata, { force: true }),
    files.rm(paths.archive, { force: true }),
    files.rm(paths.partial, { force: true }),
  ]);
}

async function download(release: ReleaseUpdate) {
  const paths = cachePaths();
  await files.mkdir(paths.directory, { recursive: true, mode: 0o700 });
  const response = await net.fetch(release.url, {
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error("Не удалось скачать обновление. Повторите проверку позже.");
  }
  const file = await files.open(paths.partial, "w", 0o600);
  const reader = response.body.getReader();
  const hash = createHash("sha256");
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > release.size) {
        throw new Error("Размер обновления превышает размер архива в релизе.");
      }
      hash.update(value);
      await file.writeFile(value);
      const progress = Math.floor((received / release.size) * 100);
      if (progress !== state.progress) {
        change({ progress });
      }
    }
    if (received !== release.size || hash.digest("hex") !== release.sha256) {
      throw new Error("Скачанное обновление повреждено. Повторите проверку.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    await file.close();
  }
  await files.rename(paths.partial, paths.archive);
  await files.writeFile(paths.metadata, JSON.stringify(release), {
    mode: 0o600,
  });
}

function ready(release: ReleaseUpdate) {
  pending = release;
  change({
    status: "ready",
    version: release.version,
    progress: 100,
    message: "Обновление скачано и готово к установке.",
  });
}

async function check() {
  let cached: ReleaseUpdate | null = null;
  change({
    status: "checking",
    version: null,
    progress: null,
    message: "Проверяем GitHub Releases…",
  });
  try {
    cached = await restorePending();
    const response = await net.fetch(releaseEndpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `OxDeck/${state.currentVersion}`,
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) {
      pending = null;
      await discardPending();
      cached = null;
      change({
        status: "idle",
        message: "Опубликованных обновлений пока нет.",
      });
      return;
    }
    if (!response.ok) {
      throw new Error(
        response.status === 403 || response.status === 429
          ? "GitHub временно ограничил запросы. Повторите проверку позже."
          : "Не удалось проверить обновления. Повторите попытку позже.",
      );
    }
    const release = selectReleaseUpdate(
      (await response.json()) as unknown,
      state.currentVersion,
      process.arch,
    );
    if (!release) {
      pending = null;
      await discardPending();
      cached = null;
      change({ status: "idle", message: "Установлена последняя версия." });
      return;
    }
    if (
      cached?.version === release.version &&
      cached.sha256 === release.sha256 &&
      cached.size === release.size
    ) {
      ready(cached);
      return;
    }
    change({
      status: "downloading",
      version: release.version,
      progress: 0,
      message: "Скачиваем обновление…",
    });
    await download(release);
    ready(release);
  } catch (error) {
    await files.rm(cachePaths().partial, { force: true }).catch(() => {});
    if (cached) {
      try {
        await verifyArchive(cachePaths().archive, cached);
        ready(cached);
        change({
          message:
            "Скачанное обновление готово к установке. Проверить новые релизы сейчас не удалось.",
        });
        return;
      } catch {
        pending = null;
      }
    }
    change({
      status: "error",
      progress: null,
      message:
        error instanceof Error &&
        !error.name.includes("Abort") &&
        !error.name.includes("Timeout") &&
        /[А-Яа-яЁё]/u.test(error.message)
          ? error.message
          : "Не удалось загрузить обновление. Проверьте сеть и повторите попытку.",
    });
  }
}

export async function checkForUpdates() {
  if (!enabled || state.status === "installing") {
    return state;
  }
  checking ??= check().finally(() => {
    checking = undefined;
  });
  await checking;
  return state;
}

async function install(release: ReleaseUpdate, beforeQuit: () => void) {
  const { archive } = cachePaths();
  await verifyArchive(archive, release);
  const token = randomBytes(32).toString("hex");
  const feedPath = `/${token}/feed`;
  const archivePath = `/${token}/update.zip`;
  let baseUrl = "";
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
    } else if (request.url === feedPath) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          url: `${baseUrl}${archivePath}`,
        }),
      );
    } else if (request.url === archivePath) {
      response.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Length": release.size,
      });
      const stream = createReadStream(archive);
      stream.on("error", () => response.destroy());
      response.on("close", () => stream.destroy());
      stream.pipe(response);
    } else {
      response.writeHead(404).end();
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Не удалось запустить установку обновления.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    // Squirrel installs staged updates on any app exit. Only stage after the click.
    await new Promise<void>((resolve, reject) => {
      const downloaded = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(
          new Error(
            "Не удалось проверить подпись или подготовить установку. " +
              "Установленная версия и обновление должны иметь одну подпись.",
          ),
        );
      };
      const cleanup = () => {
        autoUpdater.removeListener("update-downloaded", downloaded);
        autoUpdater.removeListener("error", failed);
        autoUpdater.removeListener("update-not-available", failed);
      };
      autoUpdater.once("update-downloaded", downloaded);
      autoUpdater.once("error", failed);
      autoUpdater.once("update-not-available", failed);
      try {
        autoUpdater.setFeedURL({ url: `${baseUrl}${feedPath}` });
        autoUpdater.checkForUpdates();
      } catch {
        failed();
      }
    });
    beforeQuit();
    autoUpdater.quitAndInstall();
  } finally {
    server.close();
  }
}

export function installUpdate(beforeQuit: () => void) {
  if (state.status !== "ready" || !pending) {
    return state;
  }
  change({
    status: "installing",
    progress: null,
    message: "Устанавливаем обновление…",
  });
  void install(pending, beforeQuit).catch((error: unknown) => {
    change({
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Не удалось установить обновление. Повторите проверку.",
    });
  });
  return state;
}

export function startUpdates(onChange: (state: UpdateState) => void) {
  notify = onChange;
  if (!enabled) {
    return;
  }
  // Native installation can fail asynchronously after update-downloaded.
  autoUpdater.on("error", () => {
    if (state.status === "installing") {
      change({
        status: "error",
        message:
          "Не удалось установить обновление. Повторите проверку или установите релиз вручную.",
      });
    }
  });
  void checkForUpdates();
  const timer = setInterval(() => void checkForUpdates(), checkInterval);
  timer.unref();
  app.once("before-quit", () => clearInterval(timer));
}
