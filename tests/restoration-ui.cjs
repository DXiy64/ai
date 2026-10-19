const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");
const requested = process.env.FEATURES ?? process.argv[2];
const features = new Set((requested || "").split(",").filter(Boolean));
(async () => {
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
    const source = JSON.parse(await fs.readFile("src/data.json", "utf8"));
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
    });
    let calls = 0,
      invalid = false;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/data", (route) => {
      calls++;
      return route.fulfill({ json: invalid ? { models: [] } : source });
    });
    if (features.has("live")) await page.clock.install();
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
    await page.waitForFunction(() => window.ready && window.compareLab);
    await page.evaluate(() => window.ready);
    if (features.has("live")) await page.clock.resume();
    const settle = async () => {
      await page.waitForFunction(() => !compareLab.busy);
      await page.waitForTimeout(120);
    };
    await settle();
    await page.waitForFunction(() =>
      document.querySelector("#data-status").textContent.includes("Cloudflare"),
    );
    if (requested === undefined) {
      for (const [feature, selector] of [
        ["models", "#picker"],
        ["language", "#language-switch"],
        ["theme", "#theme-switch"],
      ])
        if (await page.locator(selector).count()) features.add(feature);
      if (await page.locator("#fit-selected").isVisible())
        features.add("reset");
    }
    for (const [feature, selector] of [
      ["models", "#picker"],
      ["language", "#language-switch"],
      ["theme", "#theme-switch"],
    ])
      assert.equal(
        (await page.locator(selector).count()) > 0,
        features.has(feature),
        feature + " must match this branch scope",
      );
    const total = await page.evaluate(() => compareLab.selected.length);
    for (const view of ["front", "side", "top"]) {
      await page.locator(`[data-view=${view}]`).click();
      await settle();
      const state = await page.evaluate(() => {
        const c = document.querySelector("#chart2d");
        return {
          count: c.data.reduce((n, t) => n + t.x.length, 0),
          x: c.layout.xaxis.range,
          y: c.layout.yaxis.range,
        };
      });
      assert.equal(state.count, total);
      assert.ok(state.y[0] > state.y[1]);
      assert.equal(state.x[0] < state.x[1], view !== "side");
      await page.mouse.move(950, 450);
      await page.mouse.wheel(0, -120);
      await settle();
      assert.ok(await page.evaluate(() => compareLab.zoom > 1));
      await page.mouse.down();
      await page.mouse.move(1000, 470, { steps: 4 });
      await page.mouse.up();
      await settle();
      assert.equal(await page.evaluate(() => compareLab.active), view);
      await page.locator("#fit-selected").click();
      await settle();
      assert.ok(
        Math.abs((await page.evaluate(() => compareLab.zoom)) - 1) < 1e-6,
      );
    }
    for (const [key, view] of [
      ["1", "front"],
      ["4", "free"],
      ["3", "top"],
    ]) {
      await page.keyboard.press(key);
      await settle();
      assert.equal(await page.evaluate(() => compareLab.active), view);
    }
    if (features.has("models")) {
      await page.locator("#clear-all").click();
      await settle();
      assert.equal(await page.evaluate(() => compareLab.selected.length), 0);
      await page.locator("[data-series]").first().check();
      await settle();
      const count = await page.evaluate(() => compareLab.selected.length);
      assert.ok(count > 0 && count < total);
      await page.locator("#select-all").click();
      await settle();
      assert.equal(
        await page.evaluate(() => compareLab.selected.length),
        total,
      );
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector("#chart2d")
            .data.some((t) => t.mode === "lines+markers"),
        ),
      );
    }
    if (features.has("language") || features.has("theme")) {
      await page.mouse.move(950, 450);
      await page.mouse.wheel(0, -120);
      await settle();
      const before = await page.evaluate(() => {
        const c = document.querySelector("#chart2d");
        return [c.layout.xaxis.range, c.layout.yaxis.range];
      });
      if (features.has("language")) {
        await page.locator("#language-switch").click();
        await settle();
        assert.equal(await page.locator("html").getAttribute("lang"), "en");
        assert.equal(await page.locator("h1").innerText(), "AI Model Compare");
      }
      if (features.has("theme")) {
        await page.locator("#theme-switch").click();
        await settle();
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          "dark",
        );
      }
      assert.deepEqual(
        await page.evaluate(() => {
          const c = document.querySelector("#chart2d");
          return [c.layout.xaxis.range, c.layout.yaxis.range];
        }),
        before,
      );
    }
    await page.locator("[data-view=free]").click();
    await settle();
    assert.equal(
      await page.locator("#fit-selected").isVisible(),
      features.has("reset"),
    );
    await page.evaluate(() => compareLab.hideModel(compareLab.selected[0]));
    await settle();
    const inspect = () =>
      page.evaluate(() => {
        const c = document.querySelector("#chart3d");
        return {
          camera: c._fullLayout.scene._scene.getCamera(),
          ids: c.data.flatMap((t) => t.customdata.map((d) => d[4])),
          sizes: c.data.flatMap((t) => t.marker.size),
        };
      });
    const before = await inspect();
    assert.ok(before.sizes.every((n) => n === 5));
    await page.mouse.move(950, 450);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -60);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(700);
    const zoomed = await inspect();
    await page.waitForTimeout(300);
    assert.deepEqual(
      (await inspect()).camera,
      zoomed.camera,
      "camera does not jump after wheel stops",
    );
    assert.deepEqual(zoomed.ids, before.ids);
    assert.deepEqual(zoomed.sizes, before.sizes);
    if (features.has("reset")) {
      await page.locator("#fit-selected").click();
      await settle();
      const reset = await inspect();
      assert.deepEqual(reset.ids, before.ids);
      for (const part of ["eye", "center", "up"])
        for (const axis of ["x", "y", "z"])
          assert.ok(
            Math.abs(reset.camera[part][axis] - before.camera[part][axis]) <
              1e-6,
          );
    }
    await page.keyboard.press("/");
    await page.getByRole("dialog").waitFor();
    await page.getByRole("dialog").locator("input").fill("deep4.1");
    assert.ok(
      (await page.getByRole("dialog").innerText()).includes("DeepSeek"),
    );
    await page.keyboard.press("Escape");
    if (features.has("live")) {
      const oldCalls = calls;
      await page.clock.fastForward(5 * 60 * 1000 + 1000);
      await settle();
      assert.ok(
        calls > oldCalls,
        "visible page polls the existing API every five minutes",
      );
      invalid = true;
      const ids = (await inspect()).ids;
      await page.evaluate(() => compareLab.pollSnapshot());
      await settle();
      assert.deepEqual((await inspect()).ids, ids);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await settle();
    await fs.mkdir("test-results", { recursive: true });
    await page.screenshot({
      path:
        "test-results/restoration-" +
        ([...features].join("-") || "views") +
        ".png",
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS restoration scope: " +
        ([...features].join(",") || "plane views only"),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
