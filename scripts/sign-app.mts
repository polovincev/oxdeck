import { sign } from "@electron/osx-sign";
import path from "node:path";

const appPath = process.argv[2];
const identity = process.env.OXDECK_SIGNING_IDENTITY?.trim();
if (!appPath || !identity || identity === "-") {
  throw new Error(
    "Укажите путь к .app и OXDECK_SIGNING_IDENTITY постоянного сертификата. Ad-hoc подпись не подходит для обновлений.",
  );
}

await sign({
  app: path.resolve(appPath),
  platform: "darwin",
  identity,
  keychain: process.env.OXDECK_SIGNING_KEYCHAIN,
  identityValidation: false,
  preAutoEntitlements: false,
  preEmbedProvisioningProfile: false,
  // A self-signed identity has no Apple Team ID for hardened library validation.
  // Renderer sandboxing and context isolation are configured separately in main.ts.
  optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
});
