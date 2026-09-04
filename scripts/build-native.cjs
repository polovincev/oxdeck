const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const source = path.join(projectRoot, "native", "window_manager.mm");
const outputDirectory = path.join(projectRoot, "native", "build");
const output = path.join(outputDirectory, "window_manager.node");
const nodePrefix = path.resolve(path.dirname(process.execPath), "..");
const headerCandidates = [
    path.join(nodePrefix, "include", "node"),
    "/opt/homebrew/include/node",
    "/usr/local/include/node",
];
const headers = headerCandidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "node_api.h")),
);

if (!headers) {
    throw new Error("Не найдены заголовки Node.js (node_api.h)");
}

fs.mkdirSync(outputDirectory, { recursive: true });
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

console.log(`Собран native/build/${path.basename(output)}`);
