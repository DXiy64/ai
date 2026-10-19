const fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  await fs.mkdir("test-results", { recursive: true });
  const source = JSON.parse(await fs.readFile("src/data.json", "utf8"));
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
      errors = [],
      report = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/data", (r) => r.fulfill({ json: source }));
    await p.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
    await p.waitForFunction(() => window.ready && window.compareLab);
    await p.evaluate(() => window.ready);
    const settle = async () => {
      await p.waitForFunction(() => !compareLab.busy);
      await p.waitForTimeout(100);
    };
    await settle();
    // A real disclosure button has a bigger hit target and does not toggle selection.
    const root = p.locator(".series-node").first(),
      button = root.locator(":scope > summary > .expander");
    const box = await button.boundingBox();
    assert.ok(box.width >= 28 && box.height >= 28);
    const chosen = await p.evaluate(() => compareLab.selected.length);
    await button.click();
    assert.equal(await root.evaluate((el) => el.open), true);
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    assert.equal(await p.evaluate(() => compareLab.selected.length), chosen);
    await button.press("Enter");
    assert.equal(await root.evaluate((el) => el.open), false);
    assert.equal(await p.evaluate(() => compareLab.selected.length), chosen);
    for (const view of ["front", "side", "top"]) {
      await p.locator(`[data-view=${view}]`).click();
      await settle();
      const initial = await p.evaluate(() => {
        const c = document.querySelector("#chart2d"),
          l = c._fullLayout;
        return {
          lengths: [l.xaxis._length, l.yaxis._length],
          ranges: [l.xaxis.range, l.yaxis.range],
          marker: c.data[0].marker.size,
          line: c.data[0].line.width,
          center: {
            x: l.xaxis._offset + l.xaxis._length * 0.67,
            y: l.yaxis._offset + l.yaxis._length * 0.39,
          },
        };
      });
      await p.mouse.move(initial.center.x, initial.center.y);
      await p.mouse.wheel(0, -120);
      await settle();
      const small = await p.evaluate(() => ({
        zoom: compareLab.zoom,
        marker: document.querySelector("#chart2d").data[0].marker.size,
        line: document.querySelector("#chart2d").data[0].line.width,
      }));
      assert.ok(
        small.zoom > 1 &&
          small.marker > initial.marker &&
          small.line > initial.line,
      );
      const anchored = await p.evaluate(() => {
        const l = document.querySelector("#chart2d")._fullLayout;
        return [l.xaxis.range, l.yaxis.range];
      });
      for (const [a, f] of [
        [0, 0.67],
        [1, 0.61],
      ]) {
        const at = (r) => r[0] + f * (r[1] - r[0]);
        const errorPixels =
          (Math.abs(at(anchored[a]) - at(initial.ranges[a])) /
            Math.abs(initial.ranges[a][1] - initial.ranges[a][0])) *
          initial.lengths[a];
        assert.ok(
          errorPixels < 1,
          view + " cursor anchor drift " + errorPixels + "px",
        );
      }
      for (let i = 0; i < 14; i++) await p.mouse.wheel(0, -800);
      await settle();
      const max = await p.evaluate(() => {
        const c = document.querySelector("#chart2d"),
          l = c._fullLayout;
        return {
          zoom: compareLab.zoom,
          ranges: [l.xaxis.range, l.yaxis.range],
          marker: c.data[0].marker.size,
          line: c.data[0].line.width,
          points: c.data.reduce((n, t) => n + t.x.length, 0),
        };
      });
      assert.ok(
        max.zoom <= 50.0001 && max.zoom > 49.9,
        view + " max " + max.zoom,
      );
      assert.ok(max.marker <= 10 && max.marker > 9);
      assert.ok(Math.abs(max.line - 2.2) < 1e-6);
      assert.equal(
        max.points,
        source.models.filter((m) =>
          [m.intelligence, m.cost, m.timeSeconds].every(
            (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
          ),
        ).length,
      );
      for (let a = 0; a < 2; a++)
        assert.ok(
          Math.abs(max.ranges[a][1] - max.ranges[a][0]) >=
            Math.abs(initial.ranges[a][1] - initial.ranges[a][0]) / 50 - 1e-6,
        );
      await p.mouse.down();
      await p.mouse.move(initial.center.x + 200, initial.center.y + 150, {
        steps: 6,
      });
      await p.mouse.up();
      await settle();
      const bounded = await p.evaluate(() => {
        const l = document.querySelector("#chart2d")._fullLayout;
        return [l.xaxis.range, l.yaxis.range];
      });
      for (let a = 0; a < 2; a++)
        assert.ok(
          Math.min(...bounded[a]) >= Math.min(...initial.ranges[a]) - 1e-6 &&
            Math.max(...bounded[a]) <= Math.max(...initial.ranges[a]) + 1e-6,
        );
      for (let i = 0; i < 18; i++) await p.mouse.wheel(0, 800);
      await settle();
      const min = await p.evaluate(() => ({
        zoom: compareLab.zoom,
        marker: document.querySelector("#chart2d").data[0].marker.size,
        line: document.querySelector("#chart2d").data[0].line.width,
        ranges: [
          document.querySelector("#chart2d")._fullLayout.xaxis.range,
          document.querySelector("#chart2d")._fullLayout.yaxis.range,
        ],
      }));
      assert.ok(Math.abs(min.zoom - 1) < 0.001);
      assert.ok(Math.abs(min.marker - 6) < 1e-6);
      assert.ok(Math.abs(min.line - 1.3) < 1e-6);
      for (let a = 0; a < 2; a++)
        for (let i = 0; i < 2; i++)
          assert.ok(Math.abs(min.ranges[a][i] - initial.ranges[a][i]) < 1e-6);
      report.push({
        view,
        minZoom: min.zoom,
        maxZoom: max.zoom,
        markerRange: [min.marker, max.marker],
        lineRange: [min.line, max.line],
        pointsPreserved: true,
        panBounded: true,
      });
    }
    await p.locator("#search").fill("GPT Sol");
    await p.locator("#clear-all").click();
    await settle();
    const latest = p.locator(".version-bucket.latest [data-bucket]").first();
    await latest.check();
    await settle();
    const selected = await p.evaluate(() => compareLab.selected.length);
    await p.mouse.move(900, 450);
    await p.mouse.wheel(0, -800);
    await settle();
    const oldZoom = await p.evaluate(() => compareLab.zoom);
    await p.locator("#language-switch").click();
    await settle();
    assert.equal(await p.locator("html").getAttribute("lang"), "en");
    assert.equal(await p.locator("h1").innerText(), "AI Model Compare");
    assert.ok(
      (await p.locator(".version-bucket.latest").innerText()).includes(
        "Latest models",
      ),
    );
    assert.ok(
      (
        await p.evaluate(
          () => document.querySelector("#chart2d")._fullLayout.xaxis.title.text,
        )
      ).includes("Intelligence"),
    );
    assert.equal(await p.evaluate(() => compareLab.selected.length), selected);
    assert.ok(
      Math.abs((await p.evaluate(() => compareLab.zoom)) - oldZoom) < 0.001,
    );
    await p.locator("#theme-switch").click();
    await settle();
    assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
    const theme = await p.evaluate(() => ({
      bg: document.querySelector("#chart2d")._fullLayout.paper_bgcolor,
      hover: document.querySelector("#chart2d").data[0].hovertemplate,
    }));
    assert.equal(theme.bg, "#101722");
    assert.ok(
      theme.hover.includes("Intelligence") && !theme.hover.includes("能力"),
    );
    assert.equal(await p.evaluate(() => compareLab.selected.length), selected);
    await p.screenshot({ path: "test-results/preview-en-dark.png" });
    await p.reload();
    await p.waitForFunction(() => window.ready && window.compareLab);
    await p.evaluate(() => window.ready);
    await settle();
    assert.equal(await p.locator("html").getAttribute("lang"), "en");
    assert.equal(await p.locator("html").getAttribute("data-theme"), "dark");
    await p.locator("[data-view=front]").click();
    await settle();
    await p.screenshot({ path: "test-results/preview-plane-en-dark.png" });
    await p.locator("#language-switch").click();
    await settle();
    await p.locator("#search").fill("GPT Sol");
    await p.screenshot({ path: "test-results/preview-zh-dark.png" });
    await p.locator("#theme-switch").click();
    await settle();
    await p.screenshot({ path: "test-results/preview-zh-light.png" });
    await p.locator("[data-view=free]").click();
    await settle();
    const before3d = await p.evaluate(
      () => document.querySelector("#chart3d").data[0].marker.size,
    );
    const beforePoints = await p.evaluate(() => {
      const c = document.querySelector("#chart3d");
      window.scrollRestyles = 0;
      c.on("plotly_restyle", () => window.scrollRestyles++);
      window.cameraDistances = [];
      window.cameraSampleTimer = setInterval(() => {
        const { eye, center } = c._fullLayout.scene._scene.getCamera();
        window.cameraDistances.push(
          Math.hypot(eye.x - center.x, eye.y - center.y, eye.z - center.z),
        );
      }, 20);
      return c.data.flatMap((trace) =>
        trace.customdata.map((d, i) => [d[4], trace.marker.color[i]]),
      );
    });
    await p.mouse.move(900, 450);
    for (let i = 0; i < 12; i++) {
      await p.mouse.wheel(0, -60);
      await p.waitForTimeout(16);
    }
    await p.waitForTimeout(700);
    await settle();
    const after3d = await p.evaluate(
      () => document.querySelector("#chart3d").data[0].marker.size,
    );
    assert.deepEqual(after3d, before3d);
    const afterPoints = await p.evaluate(() => {
      const c = document.querySelector("#chart3d");
      clearInterval(window.cameraSampleTimer);
      return {
        traces: c.data.length,
        restyles: window.scrollRestyles,
        distances: window.cameraDistances,
        points: c.data.flatMap((trace) =>
          trace.customdata.map((d, i) => [d[4], trace.marker.color[i]]),
        ),
      };
    });
    assert.equal(afterPoints.traces, 1);
    assert.equal(afterPoints.restyles, 0);
    assert.ok(afterPoints.distances.at(-1) < afterPoints.distances[0] * 0.8);
    for (let i = 1; i < afterPoints.distances.length; i++)
      assert.ok(
        afterPoints.distances[i] <= afterPoints.distances[i - 1] + 0.001,
        "3D zoom must not jump back during the burst or after settling",
      );
    assert.deepEqual(afterPoints.points, beforePoints);
    assert.ok(new Set(beforePoints.map((d) => d[1])).size > 1);
    await p.locator("#theme-switch").click();
    await settle();
    await p.screenshot({ path: "test-results/preview-3d-dark.png" });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(250);
    await p.locator("#picker > summary > .expander").click();
    await p.locator("[data-view=top]").click();
    await settle();
    await p.screenshot({ path: "test-results/preview-mobile-dark.png" });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      "test-results/preferences-zoom-validation.json",
      JSON.stringify(
        {
          report,
          disclosureTarget: box,
          keyboardDisclosure: true,
          selectionUnchangedOnDisclosure: true,
          translations: true,
          themes: true,
          persistence: true,
          zoomPreservedOnPreferenceChange: true,
          threeDMarkerSizes: [before3d, after3d],
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        { report, threeDMarkerSizes: [before3d, after3d], errors },
        null,
        2,
      ),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
