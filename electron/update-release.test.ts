import assert from "node:assert/strict";
import test from "node:test";
import {
  isNewerVersion,
  parseCachedUpdate,
  selectReleaseUpdate,
} from "./update-release.js";

const digest = "ab".repeat(32);

function release(version = "1.10.0", arch = "arm64") {
  const name = `OxDeck-v${version}-${arch}.zip`;
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    published_at: "2026-09-19T12:00:00Z",
    assets: [
      {
        name,
        state: "uploaded",
        browser_download_url: `https://github.com/polovincev/oxdeck/releases/download/v${version}/${name}`,
        digest: `sha256:${digest}`,
        size: 1024,
      },
    ],
  };
}

void test("stable versions compare numerically and never downgrade", () => {
  for (const [next, current] of [
    ["1.10.0", "1.9.99"],
    ["2.0.0", "1.99.99"],
    ["0.0.10", "0.0.9"],
  ]) {
    assert.equal(isNewerVersion(next, current), true);
    assert.equal(isNewerVersion(current, next), false);
    assert.equal(isNewerVersion(next, next), false);
  }
  for (const version of [
    "",
    "v1.10.0",
    "01.10.0",
    "1.010.0",
    "1.10.00",
    "1.10",
    "1.10.0-beta.1",
    "1.10.0+build",
    "1.10.0\n",
    "9007199254740992.0.0",
  ]) {
    assert.equal(isNewerVersion(version, "1.0.0"), false, version);
    assert.equal(isNewerVersion("2.0.0", version), false, version);
  }
});

void test("selects the exact architecture archive of a published newer release", () => {
  const data = release();
  data.assets.unshift(...release("1.10.0", "x64").assets);
  assert.deepEqual(selectReleaseUpdate(data, "1.9.0", "arm64"), {
    version: "1.10.0",
    url: data.assets[1].browser_download_url,
    sha256: digest,
    size: 1024,
  });
  assert.equal(
    selectReleaseUpdate(data, "1.9.0", "x64")?.url,
    data.assets[0].browser_download_url,
  );
  assert.equal(selectReleaseUpdate(data, "1.10.0", "arm64"), null);
  assert.equal(selectReleaseUpdate(data, "2.0.0", "arm64"), null);
  assert.equal(selectReleaseUpdate(data, "dev", "arm64"), null);
  assert.equal(selectReleaseUpdate(data, "1.0.0", "ia32"), null);
});

void test("ignores drafts, prereleases, unpublished releases and nonstable tags", () => {
  for (const value of [
    null,
    [],
    {},
    { ...release(), draft: true },
    { ...release(), draft: undefined },
    { ...release(), prerelease: true },
    { ...release(), prerelease: undefined },
    { ...release(), published_at: null },
    { ...release(), published_at: "invalid" },
    { ...release(), tag_name: "1.10.0" },
    { ...release(), tag_name: "v1.10.0-rc.1" },
    { ...release(), tag_name: "v01.10.0" },
    { ...release(), tag_name: "main" },
  ]) {
    assert.equal(selectReleaseUpdate(value, "1.0.0", "arm64"), null);
  }
});

void test("new releases must contain a fully uploaded archive for this architecture", () => {
  for (const value of [
    release("1.10.0", "x64"),
    { ...release(), assets: null },
    { ...release(), assets: [null, {}, { name: "OxDeck.zip" }] },
    { ...release(), assets: [{ ...release().assets[0], state: "starter" }] },
  ]) {
    assert.throws(
      () => selectReleaseUpdate(value, "1.0.0", "arm64"),
      /отсутствует готовый архив/,
    );
  }
});

void test("rejects altered archive sources, invalid digests and unreasonable sizes", () => {
  for (const invalid of [
    { browser_download_url: "https://example.com/OxDeck.zip" },
    {
      browser_download_url:
        "https://github.com/other/oxdeck/releases/download/v1.10.0/OxDeck-v1.10.0-arm64.zip",
    },
    { browser_download_url: release("1.9.0").assets[0].browser_download_url },
    {
      browser_download_url: release("1.10.0", "x64").assets[0]
        .browser_download_url,
    },
    { digest: null },
    { digest: `sha512:${digest}` },
    { digest: `sha256:${"a".repeat(63)}` },
    { digest: `sha256:${"g".repeat(64)}` },
    { digest: `sha256:${digest}\n` },
    { size: 0 },
    { size: -1 },
    { size: 1.5 },
    { size: 2 * 1024 ** 3 + 1 },
    { size: Number.POSITIVE_INFINITY },
    { size: "1024" },
  ]) {
    const value = {
      ...release(),
      assets: [{ ...release().assets[0], ...invalid }],
    };
    assert.throws(() => selectReleaseUpdate(value, "1.0.0", "arm64"));
  }
});

void test("cached metadata has the same source and integrity boundaries as releases", () => {
  const data = release();
  data.assets[0].digest = `sha256:${digest.toUpperCase()}`;
  data.assets[0].size = 2 * 1024 ** 3;
  const update = selectReleaseUpdate(data, "1.0.0", "arm64");
  assert.ok(update);
  assert.equal(update.sha256, digest);
  assert.deepEqual(parseCachedUpdate(update, "1.0.0", "arm64"), update);
  for (const value of [
    null,
    [],
    {},
    { ...update, version: "1.0.0" },
    { ...update, version: "v1.10.0" },
    { ...update, url: "https://example.com/update.zip" },
    { ...update, sha256: "" },
    { ...update, size: 0 },
    { ...update, size: 2 * 1024 ** 3 + 1 },
  ]) {
    assert.equal(parseCachedUpdate(value, "1.0.0", "arm64"), null);
  }
  assert.equal(parseCachedUpdate(update, "1.0.0", "x64"), null);
  assert.equal(parseCachedUpdate(update, "1.0.0", "ia32"), null);
  assert.equal(parseCachedUpdate(update, "1.10.0", "arm64"), null);
  assert.equal(parseCachedUpdate(update, "2.0.0", "arm64"), null);
  assert.equal(parseCachedUpdate(update, "dev", "arm64"), null);
});
