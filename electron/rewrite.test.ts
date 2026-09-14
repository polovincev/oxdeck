import assert from "node:assert/strict";
import test from "node:test";
import { disableMcpArgs, rewriteClipboard } from "./rewrite.js";

void test("rewriting overwrites a changed clipboard and rejects concurrent requests", async () => {
  let contents = "Превет!\nКак дила?";
  const writes: string[] = [];
  const clipboard = {
    readText: () => Promise.resolve(contents),
    writeText: (text: string) => {
      contents = text;
      writes.push(text);
      return Promise.resolve();
    },
  };
  let finish!: (text: string) => void;
  const response = new Promise<string>((resolve) => {
    finish = resolve;
  });
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const request = rewriteClipboard(clipboard, (input) => {
    assert.equal(input, "Превет!\nКак дила?");
    started();
    return response;
  });
  await start;
  contents = "Скопировано во время обработки";
  assert.equal((await rewriteClipboard(clipboard)).ok, false);
  assert.deepEqual(writes, []);
  finish("Привет!\nКак дела?\n");
  assert.deepEqual(await request, { ok: true });
  assert.equal(contents, "Привет!\nКак дела?");
  assert.deepEqual(writes, ["Привет!\nКак дела?"]);
});

void test("empty input, oversized input, failed runs and empty output leave the clipboard intact", async () => {
  for (const input of ["", " \n\t", "я".repeat(50_001)]) {
    const result = await rewriteClipboard(
      {
        readText: () => Promise.resolve(input),
        writeText: () => assert.fail("must not replace clipboard"),
      },
      () => assert.fail("must not start Codex"),
    );
    assert.equal(result.ok, false);
  }
  for (const rewrite of [
    () => Promise.resolve(" \n"),
    () => Promise.reject(new Error("CLI failed")),
  ]) {
    assert.equal(
      (
        await rewriteClipboard(
          {
            readText: () => Promise.resolve("Исходный текст"),
            writeText: () => assert.fail("must not replace clipboard"),
          },
          rewrite,
        )
      ).ok,
      false,
    );
  }
  const writes: string[] = [];
  assert.deepEqual(
    await rewriteClipboard(
      {
        readText: () => Promise.resolve("Повторный запуск"),
        writeText: (text) => {
          writes.push(text);
          return Promise.resolve();
        },
      },
      () => Promise.resolve("Готово"),
    ),
    { ok: true },
  );
  assert.deepEqual(writes, ["Готово"]);
});

void test("MCP disabling covers every listed server and rejects malformed configuration", () => {
  assert.deepEqual(
    disableMcpArgs([
      { name: "context7", enabled: true },
      { name: "computer-use", enabled: false },
      { name: "custom_server_2" },
    ]),
    [
      "-c",
      "mcp_servers.context7.enabled=false",
      "-c",
      "mcp_servers.computer-use.enabled=false",
      "-c",
      "mcp_servers.custom_server_2.enabled=false",
    ],
  );
  assert.deepEqual(disableMcpArgs([]), []);
  for (const value of [
    null,
    {},
    [null],
    [{}],
    [{ name: "" }],
    [{ name: "a.b" }],
    [{ name: "a\nenabled=true" }],
  ]) {
    assert.throws(() => disableMcpArgs(value));
  }
});
