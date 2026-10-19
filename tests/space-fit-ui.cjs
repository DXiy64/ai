const fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const source = JSON.parse(await fs.readFile("src/data.json", "utf8"));
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 960 },
      }),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/data", (route) => route.fulfill({ json: source }));
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
    await page.waitForFunction(() => window.ready && window.compareLab);
    await page.evaluate(() => window.ready);
    const settle = async () => {
      await page.waitForFunction(() => !compareLab.busy);
      await page.waitForTimeout(150);
    };
    await settle();
    const inspect = () =>
      page.evaluate(() => {
        const c = document.querySelector("#chart3d"),
          scene = c._fullLayout.scene._scene;
        const { model, view, projection } = scene.glplot.cameraParams;
        const multiply = (matrix, point) =>
          [0, 1, 2, 3].map((row) =>
            point.reduce(
              (sum, v, column) => sum + matrix[column * 4 + row] * v,
              0,
            ),
          );
        const project = (point) => {
          const p = multiply(
            projection,
            multiply(view, multiply(model, [...point, 1])),
          );
          return [p[0] / p[3], p[1] / p[3], p[3]];
        };
        const bounds = scene.glplot.bounds;
        const box = [0, 1].flatMap((x) =>
          [0, 1].flatMap((y) =>
            [0, 1].map((z) =>
              project([bounds[x][0], bounds[y][1], bounds[z][2]]),
            ),
          ),
        );
        return {
          camera: scene.getCamera(),
          box,
          ranges: [
            c.layout.scene.xaxis.range,
            c.layout.scene.yaxis.range,
            c.layout.scene.zaxis.range,
          ],
          ticks: [
            c.layout.scene.xaxis.tickvals,
            c.layout.scene.yaxis.tickvals,
            c.layout.scene.zaxis.tickvals,
          ],
          points: c.data.flatMap((trace) =>
            trace.x.map((x, i) => ({
              id: trace.customdata[i][4],
              values: [x, trace.y[i], trace.z[i]],
              screen: project(
                [x, trace.y[i], trace.z[i]].map(
                  (v, axis) => v * scene.dataScale[axis],
                ),
              ),
            })),
          ),
        };
      });
    const visible = (state) =>
      assert.ok(
        [...state.box, ...state.points.map((point) => point.screen)].every(
          ([x, y, w]) => w > 0 && Math.abs(x) < 0.95 && Math.abs(y) < 0.95,
        ),
        "complete coordinate box and every selected point fit the WebGL viewport",
      );
    const choose = async (ids) => {
      await page.evaluate(async (ids) => {
        await compareLab.resetAll();
        const keep = new Set(ids);
        await Promise.all(
          compareLab.models
            .filter((model) => !keep.has(model.id))
            .map((model) => compareLab.hideModel(model.id)),
        );
      }, ids);
      await settle();
    };
    visible(await inspect());
    const ids = await page.evaluate(() =>
      compareLab.models
        .filter((model) => model.timeSeconds < 600 && model.intelligence > 15)
        .sort((a, b) => b.intelligence - a.intelligence)
        .slice(0, 45)
        .map((model) => model.id),
    );
    assert.equal(ids.length, 45);
    await choose(ids);
    const fitted = await inspect();
    visible(fitted);
    assert.equal(fitted.points.length, 45);
    assert.ok(
      fitted.ranges[2][1] < 15,
      "fast models no longer keep an empty 75-minute time axis",
    );
    for (const [axis, key, scale] of [
      [0, "intelligence", 1],
      [1, "cost", 1],
      [2, "timeSeconds", 60],
    ]) {
      const values = source.models
          .filter((model) => ids.includes(model.id))
          .map((model) => model[key] / scale),
        [low, high] = fitted.ranges[axis];
      assert.ok(low <= Math.min(...values) && high >= Math.max(...values));
      assert.ok(
        (Math.max(...values) - Math.min(...values)) / (high - low) > 0.8,
        "each coordinate range fits the selected data with padding",
      );
    }
    assert.ok(fitted.ticks.flat().every((value) => value >= 0));
    for (const point of fitted.points) {
      const original = source.models.find((model) => model.id === point.id);
      assert.deepEqual(point.values, [
        original.intelligence,
        original.cost,
        original.timeSeconds / 60,
      ]);
    }
    await page.mouse.move(950, 450);
    await page.mouse.wheel(0, -120);
    await page.mouse.down();
    await page.mouse.move(1000, 480, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const manual = await inspect();
    assert.notDeepEqual(manual.camera, fitted.camera);
    await page.setViewportSize({ width: 1250, height: 850 });
    await page.waitForTimeout(300);
    await settle();
    const resized = await inspect();
    for (const part of ["eye", "center", "up"])
      for (const axis of ["x", "y", "z"])
        assert.ok(
          Math.abs(resized.camera[part][axis] - manual.camera[part][axis]) <
            1e-6,
          "resize preserves manual camera",
        );
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.waitForTimeout(250);
    await page.locator("#fit-selected").click();
    await settle();
    const reset = await inspect();
    visible(reset);
    assert.deepEqual(
      reset.points.map((point) => point.id),
      fitted.points.map((point) => point.id),
    );
    await page.waitForTimeout(700);
    assert.deepEqual((await inspect()).camera, reset.camera);
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/space-fit-only.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await settle();
    visible(await inspect());
    await choose([ids[0]]);
    const single = await inspect();
    assert.equal(single.points.length, 1);
    assert.ok(
      single.points.every(
        ({ screen: [x, y] }) => Math.abs(x) < 1e-5 && Math.abs(y) < 1e-5,
      ),
    );
    await choose([]);
    await page.locator("#fit-selected").click();
    await settle();
    const empty = await inspect();
    assert.equal(empty.points.length, 0);
    assert.ok(empty.ranges.flat().every(Number.isFinite));
    assert.deepEqual(errors, []);
    console.log(
      "PASS independent 3D coordinate-space fit, values, complete box, manual view, reset, mobile, single and empty",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
