import assert from "node:assert/strict";
import test from "node:test";
import { getWindowBounds } from "./window-layout.js";

void test("calculates all window regions", () => {
  const area = { x: 100, y: 24, width: 1001, height: 777 };

  assert.deepEqual(getWindowBounds("left", area), {
    x: 100,
    y: 24,
    width: 500,
    height: 777,
  });
  assert.deepEqual(getWindowBounds("bottomRight", area), {
    x: 600,
    y: 412,
    width: 501,
    height: 389,
  });
  assert.deepEqual(getWindowBounds("maximize", area), area);
});
