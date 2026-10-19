import test from 'node:test';
import assert from 'node:assert/strict';
import { fitCamera, fitAxis, metricTicks } from '../app/lib/space-fit.js';

test('fitted ranges contain zero, outliers and identical points with finite padding', () => {
  for (const values of [[0, 0.001, 70], [3], [0, 0]]) {
    const range = fitAxis(values, [0, 100], 600, { size: 5, width: 0.6 });
    assert.ok(range.every(Number.isFinite));
    assert.ok(range[0] < Math.min(...values));
    assert.ok(range[1] > Math.max(...values));
    assert.ok(metricTicks(range).values.every(value => value >= 0));
  }
  assert.deepEqual(fitAxis([], [0, 100], 600, { size: 5, width: 0.6 }), [0, 100]);
});

test('camera fits all cube corners in perspective for desktop and portrait windows', () => {
  const initial = { eye: { x: 1.65, y: 1.65, z: 1.1 }, center: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, projection: { type: 'perspective' } };
  const corners = [-0.5, 0.5].flatMap(x => [-0.5, 0.5].flatMap(y => [-0.5, 0.5].map(z => [x, y, z])));
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  for (const [width, height] of [[1400, 920], [350, 804]]) {
    const camera = fitCamera(corners, initial, width, height);
    const eye = ['x', 'y', 'z'].map(key => camera.eye[key]);
    const distance = Math.hypot(...eye), back = eye.map(v => v / distance);
    const right = [-back[1], back[0], 0];
    const n = Math.hypot(...right); right.forEach((v, i) => right[i] = v / n);
    const up = [-back[2] * right[1], back[2] * right[0], back[0] * right[1] - back[1] * right[0]];
    for (const point of corners) {
      const depth = distance - dot(point, back);
      assert.ok(depth > 0);
      assert.ok(Math.abs(dot(point, up)) < depth * Math.tan(Math.PI / 8));
      assert.ok(Math.abs(dot(point, right)) < depth * Math.tan(Math.PI / 8) * width / height);
    }
  }
});
