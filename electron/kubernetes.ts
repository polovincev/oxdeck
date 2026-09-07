import { execFile } from "node:child_process";
import { constants, promises as files } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function listKubernetesContexts() {
  const directories = [
    ...new Set([
      ...(process.env.PATH ?? "").split(path.delimiter),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
    ]),
  ].filter((directory) => path.isAbsolute(directory));
  let executable = "";
  for (const directory of directories) {
    const candidate = path.join(directory, "kubectl");
    try {
      await files.access(candidate, constants.X_OK);
      executable = candidate;
      break;
    } catch {
      // GUI apps may not inherit the terminal PATH; try standard install paths too.
    }
  }
  if (!executable) {
    return {
      ok: false as const,
      message:
        "kubectl не найден. Установите его в PATH, /opt/homebrew/bin или /usr/local/bin и обновите список.",
    };
  }
  try {
    // Fixed local config command only: no shell, API requests or credential plugins.
    const { stdout } = await run(
      executable,
      ["config", "get-contexts", "--output=name"],
      {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      },
    );
    const contexts = [...new Set(stdout.split(/\r?\n/).filter(Boolean))].sort();
    return { ok: true as const, contexts };
  } catch {
    return {
      ok: false as const,
      message:
        "Не удалось прочитать контексты. Проверьте kubeconfig и KUBECONFIG, затем обновите список.",
    };
  }
}
