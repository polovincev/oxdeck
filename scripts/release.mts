import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const certificate = process.env.OXDECK_SIGNING_CERTIFICATE;
const password = process.env.OXDECK_SIGNING_PASSWORD;
const identity = process.env.OXDECK_SIGNING_IDENTITY?.trim();
if (!certificate || !password || !identity || identity === "-") {
  throw new Error(
    "Для релиза нужны secrets OXDECK_SIGNING_CERTIFICATE, OXDECK_SIGNING_PASSWORD и OXDECK_SIGNING_IDENTITY. Неподписанный релиз не публикуется.",
  );
}

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error || result.status !== 0) {
    // Never include command arguments: security receives private passwords.
    throw new Error(`${path.basename(command)} завершился с ошибкой`);
  }
}

const directory = await mkdtemp(path.join(os.tmpdir(), "oxdeck-signing-"));
const keychain = path.join(directory, "release.keychain-db");
const certificatePath = path.join(directory, "certificate.p12");
const keychainPassword = randomBytes(32).toString("hex");
const searchList = spawnSync("security", ["list-keychains", "-d", "user"], {
  encoding: "utf8",
});
if (searchList.status !== 0) {
  await rm(directory, { recursive: true, force: true });
  throw new Error("Не удалось прочитать список связок ключей");
}
const originalKeychains = [...searchList.stdout.matchAll(/"([^"]+)"/g)].map(
  (match) => match[1],
);

try {
  await writeFile(certificatePath, Buffer.from(certificate, "base64"), {
    mode: 0o600,
  });
  run("security", ["create-keychain", "-p", keychainPassword, keychain]);
  run("security", ["set-keychain-settings", "-lut", "21600", keychain]);
  run("security", ["unlock-keychain", "-p", keychainPassword, keychain]);
  run("security", [
    "import",
    certificatePath,
    "-k",
    keychain,
    "-P",
    password,
    "-T",
    "/usr/bin/codesign",
  ]);
  run("security", [
    "set-key-partition-list",
    "-S",
    "apple-tool:,apple:,codesign:",
    "-s",
    "-k",
    keychainPassword,
    keychain,
  ]);
  // codesign also searches this list when resolving the certificate chain.
  run("security", [
    "list-keychains",
    "-d",
    "user",
    "-s",
    keychain,
    ...originalKeychains,
  ]);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OXDECK_SIGNING_KEYCHAIN: keychain,
  };
  // Keep signing material out of the packaging directory and child environments.
  delete env.OXDECK_SIGNING_CERTIFICATE;
  delete env.OXDECK_SIGNING_PASSWORD;
  run("pnpm", ["make:arm64"], env);
  run("pnpm", ["make:x64"], env);
} finally {
  try {
    run("security", [
      "list-keychains",
      "-d",
      "user",
      "-s",
      ...originalKeychains,
    ]);
  } finally {
    spawnSync("security", ["delete-keychain", keychain], { stdio: "ignore" });
    await rm(directory, { recursive: true, force: true });
  }
}
