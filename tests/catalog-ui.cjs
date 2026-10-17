const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
const { chromium } = require("playwright");
(async () => {
  await fs.mkdir("test-results", { recursive: true });
  const data = JSON.parse(await fs.readFile("src/data.json", "utf8"));
  const total = data.models.filter((m) =>
    [m.intelligence, m.cost, m.timeSeconds].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    ),
  ).length;
  let incoming = {
    data,
    meta: { status: "ready", via: "source", intervalMinutes: 60 },
  };
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
    await p.route(
      "https://raw.githubusercontent.com/Mou7s/ai/main/src/data.json",
      (route) => route.fulfill({ json: incoming.data }),
    );
    await p.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
    await p.evaluate(() => window.ready);
    const settle = async () => {
      await p.waitForFunction(() => !compareLab.busy);
      await p.waitForTimeout(100);
    };
    await settle();
    assert.equal(await p.evaluate(() => compareLab.selected.length), total);
    await p.locator("#search").fill("GPT Sol");
    const root = await p.evaluate(() => {
      const s = compareLab.series.find((s) => s.name === "GPT Sol");
      return {
        index: s.index,
        total: s.versions.flatMap((f) => f.models).length,
        latest: s.latest.flatMap((f) => f.models).length,
        old: s.old.flatMap((f) => f.models).length,
        latestName: s.latest[0].name,
        oldName: s.old[0].name,
      };
    });
    assert.ok(root.latestName);
    const el = p.locator(`[data-series-node="${root.index}"]`);
    assert.ok(
      (await el.locator(".version-bucket.latest").innerText()).includes(
        root.latestName,
      ),
    );
    assert.ok(
      (await el.locator(".version-bucket.old").innerText()).includes(
        root.oldName,
      ),
    );
    await p.locator("#clear-all").click();
    await settle();
    await p.locator(`[data-root="${root.index}"][data-bucket=latest]`).check();
    await settle();
    assert.equal(
      await p.evaluate(() => compareLab.selected.length),
      root.latest,
    );
    assert.equal(
      await p
        .locator(`[data-series="${root.index}"]`)
        .evaluate((e) => e.indeterminate),
      true,
    );
    await p.locator(`[data-root="${root.index}"][data-bucket=old]`).check();
    await settle();
    assert.equal(
      await p.evaluate(() => compareLab.selected.length),
      root.total,
    );
    assert.equal(
      await p.locator(`[data-series="${root.index}"]`).isChecked(),
      true,
    );
    const first = el
      .locator(".version-bucket.latest [data-model]:not([disabled])")
      .first();
    await first.uncheck();
    await settle();
    assert.equal(
      await p.evaluate(() => compareLab.selected.length),
      root.total - 1,
    );
    assert.equal(
      await p
        .locator(`[data-root="${root.index}"][data-bucket=latest]`)
        .evaluate((e) => e.indeterminate),
      true,
    );
    await p.locator("[data-view=top]").click();
    await settle();
    const traces = await p.evaluate(() =>
      document.querySelector("#chart2d").data.map((t) => ({
        name: t.name,
        key: t.legendgroup,
        mode: t.mode,
        count: t.x.length,
        ids: t.customdata.map((d) => d[4]),
      })),
    );
    assert.equal(
      traces.reduce((n, t) => n + t.count, 0),
      root.total - 1,
    );
    for (const t of traces) {
      const expected = await p.evaluate(
        (key) =>
          compareLab.families
            .find((f) => f.key === key)
            .models.filter((m) => compareLab.selected.includes(m.id))
            .map((m) => m.id),
        t.key,
      );
      assert.deepEqual(
        t.ids,
        expected,
        "a line must never connect different versions",
      );
    }
    await p.screenshot({ path: "test-results/version-menu-gpt.png" });
    await p.locator("#search").fill("Claude Sonnet");
    await p.screenshot({ path: "test-results/version-menu-claude.png" });
    await p.locator("#select-all").click();
    await settle();
    // Deliver new version through the same HTTP polling path used in production.
    const parent = data.models.find(
        (m) => m.name === root.latestName + " (Low)",
      ),
      mock1 = {
        ...parent,
        id: "test-new-version-low",
        name: "GPT-999 Sol (Low)",
        releaseDate: "2100-01-01",
        intelligence: 100,
        cost: 12,
        timeSeconds: 8000,
      },
      mock2 = {
        ...parent,
        id: "test-new-version-high",
        name: "GPT-999 Sol (High)",
        releaseDate: "2100-01-01",
      };
    incoming = {
      data: {
        ...data,
        retrievedAt: new Date(
          Math.max(Date.now(), Date.parse(data.retrievedAt)) + 86400000,
        ).toISOString(),
        models: [...data.models, mock1, mock2],
      },
      meta: { status: "ready", via: "source", intervalMinutes: 60 },
    };
    await p.evaluate(() => compareLab.pollSnapshot());
    await settle();
    const promotion = await p.evaluate(() => {
      const s = compareLab.series.find((s) => s.name === "GPT Sol");
      return {
        latest: s.latest.map((f) => f.name),
        old: s.old.map((f) => f.name),
        selected: compareLab.selected.length,
      };
    });
    assert.deepEqual(promotion.latest, ["GPT-999 Sol"]);
    assert.ok(promotion.old.includes(root.latestName));
    assert.equal(promotion.selected, total + 2);
    assert.ok(
      await p.evaluate(
        () =>
          compareLab.metrics.ability.range[1] > 100 &&
          compareLab.metrics.cost.range[1] > 12 &&
          compareLab.metrics.time.range[1] > 8000 / 60,
      ),
    );
    // Invalid/old API data cannot erase the current menu or roll back latest.
    incoming = { data: { ...data, models: [] }, meta: { status: "ready" } };
    await p.evaluate(() => compareLab.pollSnapshot());
    assert.equal(await p.evaluate(() => compareLab.models.length), total + 2);
    incoming = { data, meta: { status: "ready", via: "source" } };
    await p.evaluate(() => compareLab.pollSnapshot());
    assert.equal(await p.evaluate(() => compareLab.models.length), total + 2);
    // Reload with the actual snapshot so QA screenshots contain no simulated dates.
    incoming = { data, meta: { status: "ready", via: "source" } };
    await p.reload();
    await p.evaluate(() => window.ready);
    await settle();
    assert.equal(await p.evaluate(() => compareLab.models.length), total);
    await p.locator("#search").fill("GPT Sol");
    await p.locator("[data-view=free]").click();
    await settle();
    assert.ok(
      await p.evaluate(() =>
        document
          .querySelector("#chart3d")
          .data.every((t) => t.mode === "markers"),
      ),
    );
    await p.screenshot({ path: "test-results/version-menu-3d.png" });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(200);
    await p.locator("[data-view=top]").click();
    await settle();
    await p.screenshot({ path: "test-results/version-menu-mobile.png" });
    assert.deepEqual(errors, []);
    await fs.writeFile(
      "test-results/version-menu-validation.json",
      JSON.stringify(
        {
          defaultSelected: total,
          hierarchy: true,
          bucketSelection: true,
          seriesSelection: true,
          modeSelection: true,
          versionLinesSeparate: true,
          simulatedNewVersionPromotion: true,
          defaultAllIncludesNewModels: true,
          invalidResponseRetained: true,
          olderResponseIgnored: true,
          threeDLinesHidden: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: hierarchical series/latest/old/version/mode menu, linked selection, polling-based promotion, invalid/older response retention, 3D line suppression.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
