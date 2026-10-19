const fs = require("node:fs/promises"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright");
(async () => {
  const data = JSON.parse(await fs.readFile("src/data.json", "utf8"));
  const b = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 960 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/data", (r) => r.fulfill({ json: data }));
    await p.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
    await p.waitForFunction(() => window.compareLab && window.ready);
    await p.evaluate(() => window.ready);
    const settle = async () => {
      await p.waitForFunction(() => !compareLab.busy);
      await p.waitForTimeout(100);
    };
    await settle();
    const ids = await p.evaluate(() =>
      compareLab.models
        .filter((m) => m.timeSeconds < 600 && m.intelligence > 15)
        .sort((a, b) => b.intelligence - a.intelligence)
        .slice(0, 45)
        .map((m) => m.id),
    );
    assert.equal(ids.length, 45);
    const choose = async (ids) => {
      await p.locator("#clear-all").click();
      await settle();
      await p.evaluate((ids) => {
        const wanted = new Set(ids);
        for (const family of compareLab.families) {
          if (family.entries.length === 1) {
            const m = family.models[0];
            if (m && wanted.has(m.id))
              document.querySelector(`[data-family="${family.index}"]`).click();
          } else
            for (const m of family.models)
              if (wanted.has(m.id))
                document.querySelector(`[data-model="${m.id}"]`).click();
        }
      }, ids);
      await settle();
    };
    const inspect = () =>
      p.evaluate(() => {
        const c = document.querySelector("#chart2d"),
          l = c._fullLayout,
          x = c.data.flatMap((t) => t.x),
          y = c.data.flatMap((t) => t.y),
          xp = x.map((v) => l.xaxis.l2p(v)),
          yp = y.map((v) => l.yaxis.l2p(v));
        return {
          ranges: [l.xaxis.range, l.yaxis.range],
          count: x.length,
          zoom: compareLab.zoom,
          auto: compareLab.autoFit,
          xPadding: [Math.min(...xp), l.xaxis._length - Math.max(...xp)],
          yPadding: [Math.min(...yp), l.yaxis._length - Math.max(...yp)],
          xCoverage: (Math.max(...xp) - Math.min(...xp)) / l.xaxis._length,
          yCoverage: (Math.max(...yp) - Math.min(...yp)) / l.yaxis._length,
          ticks: [l.xaxis.tickvals, l.yaxis.tickvals],
          center: {
            x: l.xaxis._offset + l.xaxis._length * 0.5,
            y: l.yaxis._offset + l.yaxis._length * 0.5,
          },
        };
      });
    const report = [];
    for (const view of ["front", "side", "top"]) {
      await p.locator(`[data-view=${view}]`).click();
      await choose(ids);
      const fitted = await inspect();
      assert.equal(fitted.count, 45);
      assert.ok(fitted.auto && Math.abs(fitted.zoom - 1) < 1e-6);
      assert.ok(
        [...fitted.xPadding, ...fitted.yPadding].every((n) => n >= 14),
        "all selected extrema have readable marker/line padding",
      );
      assert.ok(
        fitted.yCoverage > 0.6 && fitted.xCoverage > 0.6,
        "selected data uses the plot rather than staying at the top",
      );
      assert.ok(fitted.ticks.flat().every((n) => n >= 0));
      await p.mouse.move(fitted.center.x, fitted.center.y);
      await p.mouse.wheel(0, -300);
      await settle();
      const manual = await inspect();
      assert.ok(!manual.auto && manual.zoom > 1);
      await p.locator("#language-switch").click();
      await settle();
      await p.locator("#theme-switch").click();
      await settle();
      assert.deepEqual(
        (await inspect()).ranges,
        manual.ranges,
        "preference changes preserve manual view",
      );
      await p.locator("#fit-selected").click();
      await settle();
      const reset = await inspect();
      assert.deepEqual(reset.ranges, fitted.ranges);
      assert.ok(reset.auto && Math.abs(reset.zoom - 1) < 1e-6);
      report.push({
        view,
        points: fitted.count,
        coverage: [fitted.xCoverage, fitted.yCoverage],
        padding: [fitted.xPadding, fitted.yPadding],
      });
    }
    await p.locator("[data-view=front]").click();
    await choose(ids);
    await p.setViewportSize({ width: 980, height: 720 });
    await p.waitForTimeout(200);
    await settle();
    const resized = await inspect();
    assert.ok(resized.auto && resized.yCoverage > 0.6);
    assert.equal(resized.count, 45);
    await choose([ids[0]]);
    const single = await inspect();
    assert.equal(single.count, 1);
    assert.ok(
      Math.abs(single.xPadding[0] - single.xPadding[1]) < 1 &&
        Math.abs(single.yPadding[0] - single.yPadding[1]) < 1,
      "one point is centered",
    );
    await p.locator("#clear-all").click();
    await settle();
    assert.equal(await p.locator("#empty").isVisible(), true);
    await p.locator("#select-all").click();
    await settle();
    assert.equal(
      (await inspect()).count,
      data.models.filter((m) =>
        [m.intelligence, m.cost, m.timeSeconds].every(
          (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
        ),
      ).length,
    );
    // Check the real WebGL projection, not just the camera-fit formula.
    const inspect3d = () =>
      p.evaluate(() => {
        const chart = document.querySelector("#chart3d"),
          scene = chart._fullLayout.scene._scene;
        const { model, view, projection } = scene.glplot.cameraParams;
        const multiply = (matrix, point) =>
          [0, 1, 2, 3].map((row) =>
            point.reduce(
              (sum, v, column) => sum + matrix[column * 4 + row] * v,
              0,
            ),
          );
        const projected = chart.data.flatMap((trace) =>
          trace.x.map((x, i) => {
            const point = [x, trace.y[i], trace.z[i]].map(
              (v, axis) => v * scene.dataScale[axis],
            );
            const clip = multiply(
              projection,
              multiply(view, multiply(model, [...point, 1])),
            );
            return [clip[0] / clip[3], clip[1] / clip[3], clip[3]];
          }),
        );
        const bounds = scene.glplot.bounds;
        const box = [0, 1].flatMap((x) =>
          [0, 1].flatMap((y) =>
            [0, 1].map((z) => {
              const clip = multiply(
                projection,
                multiply(
                  view,
                  multiply(model, [
                    bounds[x][0],
                    bounds[y][1],
                    bounds[z][2],
                    1,
                  ]),
                ),
              );
              return [clip[0] / clip[3], clip[1] / clip[3], clip[3]];
            }),
          ),
        );
        return {
          camera: scene.getCamera(),
          projected,
          box,
          ids: chart.data.flatMap((trace) => trace.customdata.map((d) => d[4])),
          ranges: [
            chart.layout.scene.xaxis.range,
            chart.layout.scene.yaxis.range,
            chart.layout.scene.zaxis.range,
          ],
        };
      });
    await p.locator("[data-view=free]").click();
    await settle();
    assert.equal(await p.locator("#fit-selected").isVisible(), true);
    const all3d = await inspect3d();
    await choose(ids);
    const fitted3d = await inspect3d();
    assert.equal(fitted3d.ids.length, 45);
    assert.ok(
      fitted3d.ranges[2][1] < 15,
      "fast selection does not retain the full 75 minute axis",
    );
    for (const [axis, metric, scale] of [
      [0, "intelligence", 1],
      [1, "cost", 1],
      [2, "timeSeconds", 60],
    ]) {
      const values = data.models
        .filter((m) => ids.includes(m.id))
        .map((m) => m[metric] / scale);
      const [low, high] = fitted3d.ranges[axis];
      assert.ok(
        low <= Math.min(...values) && high >= Math.max(...values),
        "fitted axes preserve every selected value",
      );
      assert.ok(
        (Math.max(...values) - Math.min(...values)) / (high - low) > 0.8,
        "selected data fills each coordinate axis",
      );
    }
    const assertVisible = (state) => {
      assert.ok(
        state.projected.every(
          ([x, y, w]) => w > 0 && Math.abs(x) < 0.95 && Math.abs(y) < 0.95,
        ),
        "every selected marker fits inside the real WebGL viewport",
      );
    };
    assertVisible(all3d);
    assertVisible(fitted3d);
    assert.ok(
      Math.max(
        ...[0, 1].map(
          (axis) =>
            Math.max(...fitted3d.box.map((p) => p[axis])) -
            Math.min(...fitted3d.box.map((p) => p[axis])),
        ),
      ) > 1,
      "the whole fitted coordinate box uses at least half the viewport",
    );
    assertVisible({ projected: fitted3d.box });
    await p.screenshot({ path: "test-results/3d-fitted-axis-box.png" });
    await p.mouse.move(650, 350);
    await p.mouse.wheel(0, -120);
    await p.mouse.down();
    await p.mouse.move(700, 400, { steps: 5 });
    await p.mouse.up();
    await p.waitForTimeout(500);
    assert.notDeepEqual((await inspect3d()).camera, fitted3d.camera);
    await p.locator("#fit-selected").click();
    await settle();
    const reset3d = await inspect3d();
    assert.deepEqual(reset3d.ids, fitted3d.ids, "3D reset keeps filters");
    for (const part of ["eye", "center", "up"])
      for (const axis of ["x", "y", "z"])
        assert.ok(
          Math.abs(reset3d.camera[part][axis] - fitted3d.camera[part][axis]) <
            1e-6,
          "reset restores direction, center, and fitted zoom",
        );
    await p.waitForTimeout(700);
    assert.deepEqual(
      (await inspect3d()).camera,
      reset3d.camera,
      "reset camera stays stable",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(300);
    await settle();
    assertVisible(await inspect3d());
    await choose([ids[0]]);
    const single3d = await inspect3d();
    assert.equal(single3d.ids.length, 1);
    assert.ok(
      single3d.projected.every(
        ([x, y]) => Math.abs(x) < 1e-5 && Math.abs(y) < 1e-5,
      ),
      "single 3D point is centered",
    );
    await p.locator("#clear-all").click();
    await settle();
    await p.locator("#fit-selected").click();
    await settle();
    assert.equal((await inspect3d()).ids.length, 0);
    assert.deepEqual(errors, []);
    await fs.mkdir("test-results", { recursive: true });
    await fs.writeFile(
      "test-results/selection-fit.json",
      JSON.stringify(
        {
          report,
          manualViewPreserved: true,
          fitReset: true,
          responsive: true,
          singlePointCentered: true,
          emptySafe: true,
          allPointsRetained: true,
          threeD: {
            resetKeepsSelection: true,
            projectionFit: true,
            responsive: true,
            singlePointCentered: true,
            emptySafe: true,
          },
          errors,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ report, errors }, null, 2));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
