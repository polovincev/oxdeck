export type ReleaseUpdate = {
  version: string;
  url: string;
  sha256: string;
  size: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVersion(value: string): number[] | null {
  if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value)?.[0] !== value) {
    return null;
  }
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) {
    return false;
  }
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== installed[index]) {
      return next[index] > installed[index];
    }
  }
  return false;
}

function parseUpdate(
  value: unknown,
  currentVersion: string,
  arch: string,
): ReleaseUpdate {
  if (
    !isRecord(value) ||
    typeof value.version !== "string" ||
    !isNewerVersion(value.version, currentVersion) ||
    (arch !== "arm64" && arch !== "x64")
  ) {
    throw new Error("Неподдерживаемая версия обновления.");
  }
  const name = `OxDeck-v${value.version}-${arch}.zip`;
  const url = `https://github.com/polovincev/oxdeck/releases/download/v${value.version}/${name}`;
  if (value.url !== url) {
    throw new Error("Адрес архива обновления не соответствует релизу OxDeck.");
  }
  if (
    typeof value.sha256 !== "string" ||
    value.sha256.length !== 64 ||
    !/^[a-fA-F0-9]{64}$/.test(value.sha256)
  ) {
    throw new Error(
      "У архива обновления отсутствует корректная сумма SHA-256.",
    );
  }
  if (
    typeof value.size !== "number" ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    value.size > 2 * 1024 ** 3
  ) {
    throw new Error("Размер архива обновления недопустим (максимум 2 ГиБ).");
  }
  return {
    version: value.version,
    url,
    sha256: value.sha256.toLowerCase(),
    size: value.size,
  };
}

export function parseCachedUpdate(
  value: unknown,
  currentVersion: string,
  arch: string,
): ReleaseUpdate | null {
  try {
    return parseUpdate(value, currentVersion, arch);
  } catch {
    return null;
  }
}

export function selectReleaseUpdate(
  value: unknown,
  currentVersion: string,
  arch: string,
): ReleaseUpdate | null {
  if (
    !isRecord(value) ||
    value.draft !== false ||
    value.prerelease !== false ||
    typeof value.published_at !== "string" ||
    !Number.isFinite(Date.parse(value.published_at)) ||
    typeof value.tag_name !== "string" ||
    !value.tag_name.startsWith("v") ||
    !isNewerVersion(value.tag_name.slice(1), currentVersion) ||
    (arch !== "arm64" && arch !== "x64")
  ) {
    return null;
  }
  const version = value.tag_name.slice(1);
  const name = `OxDeck-v${version}-${arch}.zip`;
  const assets: unknown[] = Array.isArray(value.assets) ? value.assets : [];
  const asset = assets.find((item) => isRecord(item) && item.name === name);
  if (!isRecord(asset) || asset.state !== "uploaded") {
    throw new Error(`В релизе отсутствует готовый архив ${name}.`);
  }
  return parseUpdate(
    {
      version,
      url: asset.browser_download_url,
      sha256:
        typeof asset.digest === "string" && asset.digest.startsWith("sha256:")
          ? asset.digest.slice("sha256:".length)
          : null,
      size: asset.size,
    },
    currentVersion,
    arch,
  );
}
