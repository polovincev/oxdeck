const assert = require("node:assert/strict");
const test = require("node:test");
const { getWindowBounds } = require("./window-layout.cjs");

test("calculates window regions inside the available screen area", () => {
    const area = { x: 100, y: 24, width: 1001, height: 777 };

    assert.deepEqual(getWindowBounds("left", area), {
        x: 100,
        y: 24,
        width: 500,
        height: 777,
    });
    assert.deepEqual(getWindowBounds("right", area), {
        x: 600,
        y: 24,
        width: 501,
        height: 777,
    });
    assert.deepEqual(getWindowBounds("topRight", area), {
        x: 600,
        y: 24,
        width: 501,
        height: 388,
    });
    assert.deepEqual(getWindowBounds("bottomRight", area), {
        x: 600,
        y: 412,
        width: 501,
        height: 389,
    });
    assert.deepEqual(getWindowBounds("maximize", area), area);
    assert.throws(() => getWindowBounds("unknown", area));
});
