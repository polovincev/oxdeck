import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const source = path.join(root, "native/window_manager.mm");
const directory = path.join(root, "native/build");
const output = path.join(directory, "window_manager.node");
const nodePrefix = path.resolve(path.dirname(process.execPath), "..");
const headers = [
  path.join(nodePrefix, "include/node"),
  "/opt/homebrew/include/node",
  "/usr/local/include/node",
].find((candidate) => fs.existsSync(path.join(candidate, "node_api.h")));

if (!headers) {
  throw new Error("Не найдены заголовки Node.js (node_api.h)");
}
fs.mkdirSync(directory, { recursive: true });
const clang = execFileSync("/usr/bin/xcrun", ["--find", "clang++"], {
  encoding: "utf8",
}).trim();
const sdk = execFileSync("/usr/bin/xcrun", ["--show-sdk-path"], {
  encoding: "utf8",
}).trim();

execFileSync(
  clang,
  [
    "-bundle",
    "-undefined",
    "dynamic_lookup",
    "-std=c++17",
    "-fobjc-arc",
    "-mmacosx-version-min=13.0",
    "-isysroot",
    sdk,
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    `-I${headers}`,
    "-framework",
    "AppKit",
    "-framework",
    "ApplicationServices",
    source,
    "-o",
    output,
  ],
  { stdio: "inherit" },
);
