import test from "node:test";
import assert from "node:assert/strict";
import { fitAxis, metricTicks } from "../app/lib/plane-fit.js";
test("selected extrema and connecting strokes keep screen-space padding, including zero and outliers", () => {
  const values = [0, 0.1, 0.2, 2, 10],
    size = 10,
    width = 2.2,
    pixels = 700;
  const range = fitAxis(values, [0, 75], pixels, { size, width });
  const toPixel = (v) => ((v - range[0]) / (range[1] - range[0])) * pixels;
  assert.ok(toPixel(0) > size / 2 + width / 2 + 12);
  assert.ok(pixels - toPixel(10) > size / 2 + width / 2 + 12);
  assert.ok(
    range[1] - range[0] < 15,
    "fit selected data rather than full dataset",
  );
  assert.ok(metricTicks(range).values.every((v) => v >= 0));
  const large = fitAxis(values, [0, 75], 160, { size: 32, width: 6 }),
    small = fitAxis(values, [0, 75], 160, { size: 6, width: 1 });
  assert.ok(
    large[1] - large[0] > small[1] - small[0],
    "larger point and stroke styles get more room",
  );
});
test("single/identical points are centered with finite bounds; empty selections fall back safely", () => {
  for (const values of [[0], [5, 5, 5]]) {
    const range = fitAxis(values, [0, 75], 400, { size: 6, width: 1.3 });
    assert.ok(range.every(Number.isFinite) && range[1] > range[0]);
    assert.ok(Math.abs((range[0] + range[1]) / 2 - values[0]) < 1e-9);
  }
  assert.deepEqual(fitAxis([], [0, 75], 400, { size: 6, width: 1.3 }), [0, 75]);
  const ticks = metricTicks([0.001, 0.006]);
  assert.ok(
    ticks.values.length > 0 &&
      ticks.values.every((v) => v >= 0.001 && v <= 0.006),
  );
});
