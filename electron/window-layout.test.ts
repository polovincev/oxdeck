import assert from "node:assert/strict";
import test from "node:test";
import {
  findPreferredDisplay,
  getWindowBounds,
  type DisplaySnapshot,
} from "./window-layout.js";

const savedDisplay: DisplaySnapshot = {
  id: 42,
  label: "Touchscreen",
  internal: false,
  width: 1920,
  height: 1080,
};
const touchscreen = {
  id: savedDisplay.id,
  label: savedDisplay.label,
  internal: savedDisplay.internal,
  size: { width: savedDisplay.width, height: savedDisplay.height },
};
const builtIn = {
  id: 1,
  label: "Built-in",
  internal: true,
  size: { width: 1440, height: 900 },
};

void test("keeps the chosen display through disconnects and reconnects", () => {
  const connected = [builtIn, touchscreen];
  assert.equal(findPreferredDisplay(null, connected), null);
  assert.equal(findPreferredDisplay(savedDisplay, connected), touchscreen);
  assert.equal(findPreferredDisplay(savedDisplay, [builtIn]), null);
  const reconnected = { ...touchscreen, id: 84 };
  assert.equal(
    findPreferredDisplay(savedDisplay, [builtIn, reconnected]),
    reconnected,
  );
  assert.equal(savedDisplay.id, 42);
});

void test("recognizes the display after its ID and resolution change", () => {
  const resized = {
    ...touchscreen,
    size: { width: 1280, height: 720 },
  };
  assert.equal(findPreferredDisplay(savedDisplay, [builtIn, resized]), resized);
  const reconnected = { ...resized, id: 84 };
  assert.equal(
    findPreferredDisplay(savedDisplay, [builtIn, reconnected]),
    reconnected,
  );
});

void test("does not follow a reused ID to another monitor after a dock reconnect", () => {
  const primary = { ...touchscreen, label: "Odyssey G95SD" };
  const reconnected = { ...touchscreen, id: 84 };
  assert.equal(findPreferredDisplay(savedDisplay, [builtIn, primary]), null);
  assert.equal(
    findPreferredDisplay(savedDisplay, [primary, builtIn, reconnected]),
    reconnected,
  );
});

void test("does not confuse external and built-in displays", () => {
  assert.equal(
    findPreferredDisplay(savedDisplay, [{ ...touchscreen, internal: true }]),
    null,
  );
});

void test("does not guess between identical displays or invalid IDs", () => {
  const first = { ...touchscreen, id: 84 };
  const second = { ...touchscreen, id: 85 };
  assert.equal(findPreferredDisplay(savedDisplay, [first, second]), null);
  assert.equal(
    findPreferredDisplay(savedDisplay, [
      first,
      { ...second, size: { width: 1280, height: 720 } },
    ]),
    null,
  );
  assert.equal(
    findPreferredDisplay(savedDisplay, [first, touchscreen]),
    touchscreen,
  );
  assert.equal(
    findPreferredDisplay(savedDisplay, [
      { ...touchscreen, id: -1 },
      { ...touchscreen, id: -10 },
    ]),
    null,
  );
});

void test("handles unnamed monitors without choosing an arbitrary screen", () => {
  const saved = { ...savedDisplay, label: "" };
  const unnamed = { ...touchscreen, label: "", id: 84 };
  assert.equal(findPreferredDisplay(saved, [builtIn, unnamed]), unnamed);
  assert.equal(
    findPreferredDisplay(saved, [
      builtIn,
      { ...unnamed, size: { width: 1280, height: 720 } },
    ]),
    null,
  );
  const internal = { ...builtIn, label: "", id: 2 };
  assert.equal(
    findPreferredDisplay({ ...saved, internal: true }, [internal, unnamed]),
    internal,
  );
});

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
  assert.deepEqual(getWindowBounds("leftThird", area), {
    x: 100,
    y: 24,
    width: 333,
    height: 777,
  });
  assert.deepEqual(getWindowBounds("centerThird", area), {
    x: 433,
    y: 24,
    width: 334,
    height: 777,
  });
  assert.deepEqual(getWindowBounds("rightThird", area), {
    x: 767,
    y: 24,
    width: 334,
    height: 777,
  });
  assert.deepEqual(getWindowBounds("maximize", area), area);
});
