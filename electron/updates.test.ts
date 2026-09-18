import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as files } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import type { UpdateState } from "../shared/updates.js";
import type * as Updates from "./updates.js";

const requireModule = createRequire(__filename);

async function harness(context: TestContext, isPackaged = true) {
  const directory = await files.mkdtemp(
    path.join(os.tmpdir(), "oxdeck-updates-"),
  );
  const app = Object.assign(new EventEmitter(), {
    isPackaged,
    getVersion: () => "1.5.0",
    getPath: () => directory,
  });
  context.after(async () => {
    app.emit("before-quit");
    await files.rm(directory, { recursive: true, force: true });
  });
  const remote = {
    version: "1.6.0",
    archive: Buffer.from("OxDeck archive fixture"),
    body: undefined as Buffer | undefined,
    offline: false,
  };
  const calls = {
    checks: 0,
    downloads: 0,
    nativeChecks: 0,
    quits: 0,
    closes: 0,
  };
  const autoUpdater = Object.assign(new EventEmitter(), {
    setFeedURL: ({ url }: { url: string }) => {
      assert.match(url, /^http:\/\/127\.0\.0\.1:12345\/[a-f0-9]{64}\/feed$/);
    },
    checkForUpdates: () => {
      calls.nativeChecks += 1;
      queueMicrotask(() => autoUpdater.emit("update-downloaded"));
    },
    quitAndInstall: () => {
      calls.quits += 1;
      // Native relaunch failures arrive after quitAndInstall has returned.
      queueMicrotask(() =>
        autoUpdater.emit("error", new Error("relaunch failed")),
      );
    },
  });
  const electron = {
    app,
    autoUpdater,
    net: {
      fetch: (url: string) => {
        if (url.startsWith("https://api.github.com/")) {
          calls.checks += 1;
          if (remote.offline) {
            return Promise.reject(new Error("offline"));
          }
          const name = `OxDeck-v${remote.version}-arm64.zip`;
          return Promise.resolve(
            Response.json({
              tag_name: `v${remote.version}`,
              draft: false,
              prerelease: false,
              published_at: "2026-09-19T12:00:00Z",
              assets: [
                {
                  name,
                  state: "uploaded",
                  browser_download_url: `https://github.com/polovincev/oxdeck/releases/download/v${remote.version}/${name}`,
                  digest: `sha256:${createHash("sha256").update(remote.archive).digest("hex")}`,
                  size: remote.archive.length,
                },
              ],
            }),
          );
        }
        calls.downloads += 1;
        const body = remote.body ?? remote.archive;
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array(body.subarray(0, 3)));
                controller.enqueue(new Uint8Array(body.subarray(3)));
                controller.close();
              },
            }),
          ),
        );
      },
    },
  };
  // Keep filesystem and hashing real; only Electron and the listening socket are fake.
  const http = {
    createServer: () =>
      Object.assign(new EventEmitter(), {
        listen: (port: number, host: string, callback: () => void) => {
          assert.equal(port, 0);
          assert.equal(host, "127.0.0.1");
          queueMicrotask(callback);
        },
        address: () => ({ port: 12345 }),
        close: () => {
          calls.closes += 1;
        },
      }),
  };
  const api = {} as typeof Updates;
  runInNewContext(
    await files.readFile(path.join(__dirname, "updates.js"), "utf8"),
    {
      exports: api,
      require: (name: string): unknown => {
        if (name === "electron") {
          return electron;
        }
        if (name === "node:http") {
          return http;
        }
        return requireModule(name) as unknown;
      },
      process: { platform: "darwin", arch: "arm64" },
      setInterval,
      clearInterval,
      AbortSignal,
      Error,
    },
  );
  let failed!: (state: UpdateState) => void;
  const failure = new Promise<UpdateState>((resolve) => {
    failed = resolve;
  });
  return {
    api,
    remote,
    calls,
    autoUpdater,
    failure,
    archive: path.join(directory, "updates/pending.zip"),
    partial: path.join(directory, "updates/pending.zip.part"),
    metadata: path.join(directory, "updates/pending.json"),
    start: async () => {
      api.startUpdates((state) => {
        if (state.status === "error") {
          failed(state);
        }
      });
      return api.checkForUpdates();
    },
  };
}

void test("development builds never contact GitHub or start native updates", async (context) => {
  const update = await harness(context, false);
  assert.equal((await update.start()).status, "disabled");
  assert.equal((await update.api.checkForUpdates()).status, "disabled");
  assert.equal(
    update.api.installUpdate(() => assert.fail("must not quit")).status,
    "disabled",
  );
  assert.equal(update.calls.checks, 0);
  assert.equal(update.calls.downloads, 0);
  assert.equal(update.calls.nativeChecks, 0);
});

void test("background downloads persist verified bytes without staging or installing", async (context) => {
  const update = await harness(context);
  const state = await update.start();
  assert.equal(state.status, "ready");
  assert.equal(state.version, "1.6.0");
  assert.equal(state.progress, 100);
  assert.deepEqual(await files.readFile(update.archive), update.remote.archive);
  assert.equal(update.calls.checks, 1);
  assert.equal(update.calls.downloads, 1);
  assert.equal(update.calls.nativeChecks, 0);
  assert.equal(update.calls.quits, 0);
});

void test("checks continue with a ready cache, reusing unchanged bytes and replacing a newer release", async (context) => {
  const update = await harness(context);
  await update.start();
  assert.equal((await update.api.checkForUpdates()).status, "ready");
  assert.equal(update.calls.checks, 2);
  assert.equal(update.calls.downloads, 1);

  update.remote.version = "1.7.0";
  update.remote.archive = Buffer.from("newer OxDeck archive");
  const next = await update.api.checkForUpdates();
  assert.equal(next.status, "ready");
  assert.equal(next.version, "1.7.0");
  assert.equal(update.calls.checks, 3);
  assert.equal(update.calls.downloads, 2);
  assert.deepEqual(await files.readFile(update.archive), update.remote.archive);
  const metadata = JSON.parse(
    await files.readFile(update.metadata, "utf8"),
  ) as { version: string };
  assert.equal(metadata.version, "1.7.0");
  assert.equal(update.calls.nativeChecks, 0);
});

void test("offline checks retain only an intact previously downloaded update", async (context) => {
  const update = await harness(context);
  await update.start();
  update.remote.offline = true;
  const cached = await update.api.checkForUpdates();
  assert.equal(cached.status, "ready");
  assert.equal(cached.version, "1.6.0");
  assert.equal(update.calls.downloads, 1);

  await files.writeFile(
    update.archive,
    Buffer.alloc(update.remote.archive.length),
  );
  assert.equal((await update.api.checkForUpdates()).status, "error");
  await assert.rejects(files.access(update.archive), { code: "ENOENT" });
  await assert.rejects(files.access(update.metadata), { code: "ENOENT" });
  assert.equal(update.calls.nativeChecks, 0);
});

void test("wrong hashes, truncated downloads and oversized downloads never become ready", async (context) => {
  for (const kind of ["hash", "truncated", "oversized"]) {
    const update = await harness(context);
    update.remote.body =
      kind === "hash"
        ? Buffer.alloc(update.remote.archive.length)
        : kind === "truncated"
          ? update.remote.archive.subarray(0, -1)
          : Buffer.concat([update.remote.archive, Buffer.from("extra")]);
    assert.equal((await update.start()).status, "error", kind);
    await assert.rejects(files.access(update.partial), { code: "ENOENT" });
    await assert.rejects(files.access(update.archive), { code: "ENOENT" });
    await assert.rejects(files.access(update.metadata), { code: "ENOENT" });
    assert.equal(update.calls.nativeChecks, 0);
  }
});

void test(
  "tampering after download blocks installation before the native updater runs",
  { timeout: 5000 },
  async (context) => {
    const update = await harness(context);
    await update.start();
    await files.writeFile(
      update.archive,
      Buffer.alloc(update.remote.archive.length),
    );
    update.api.installUpdate(() => assert.fail("must not quit"));
    assert.equal((await update.failure).status, "error");
    assert.equal(update.calls.nativeChecks, 0);
    assert.equal(update.calls.quits, 0);
  },
);

void test(
  "installation starts only after the click and handles delayed native failure",
  { timeout: 5000 },
  async (context) => {
    const update = await harness(context);
    await update.start();
    let beforeQuit = 0;
    update.api.installUpdate(() => {
      beforeQuit += 1;
    });
    update.api.installUpdate(() => assert.fail("must not install twice"));
    assert.equal((await update.failure).status, "error");
    assert.equal(beforeQuit, 1);
    assert.equal(update.calls.nativeChecks, 1);
    assert.equal(update.calls.quits, 1);
    assert.equal(update.calls.closes, 1);
    assert.equal(update.autoUpdater.listenerCount("update-downloaded"), 0);
    assert.equal(update.autoUpdater.listenerCount("error"), 1);
  },
);
