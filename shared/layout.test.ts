import assert from "node:assert/strict";
import test from "node:test";
import {
  packWidgets,
  placeWidget,
  recommendedUiScale,
  type LayoutWidget,
} from "./layout.js";

const widgets: LayoutWidget[] = [
  { id: "a", type: "app", path: "/a.app", name: "A", x: 8, y: 0, w: 1, h: 1 },
  { id: "files", type: "files", x: 0, y: 0, w: 2, h: 2 },
];

test("packs without collisions and rejects occupied cells", () => {
  const packed = packWidgets(widgets, 5, 3);
  assert.equal(packed.hidden, 0);
  assert.deepEqual(packed.items.map(({ x, y }) => [x, y]), [[0, 0], [2, 0]]);
  assert.equal(
    placeWidget(packed.items, { ...widgets[0], x: 0, y: 0 }, 5, 3),
    null,
  );
});

test("recommends larger content only for unscaled high-density displays", () => {
  assert.equal(recommendedUiScale(2560, 720, 1), 1.5);
  assert.equal(recommendedUiScale(5120, 1440, 1), 1.25);
  assert.equal(recommendedUiScale(3024, 1964, 2), 1);
});
