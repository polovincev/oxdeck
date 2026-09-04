import { spawn, spawnSync } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import electron from "electron";
import { createServer } from "vite";

let process: ReturnType<typeof spawn> | undefined;
let timer: NodeJS.Timeout | undefined;

function compile() {
  const result = spawnSync("pnpm", ["build:electron"], { stdio: "inherit" });
  return result.status === 0;
}

async function main() {
  const server = await createServer();
  await server.listen();
  server.printUrls();
  const url = server.resolvedUrls?.local[0];

  function start() {
    process = spawn(electron as unknown as string, ["."], {
      cwd: import.meta.dirname,
      stdio: "inherit",
      env: { ...globalThis.process.env, OXDECK_RENDERER_URL: url },
    });
    process.once("exit", () => {
      process = undefined;
    });
  }

  function rebuild() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!compile()) {
        return;
      }
      process?.once("exit", start);
      process?.kill();
      if (!process) {
        start();
      }
    }, 120);
  }

  for (const directory of ["electron", "shared"]) {
    watch(
      path.join(import.meta.dirname, directory),
      { recursive: true },
      rebuild,
    );
  }
  start();
}

void main();
