const fs = require("node:fs/promises"),
  assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const data = JSON.parse(await fs.readFile("src/data.json", "utf8"));
  const total = data.models.filter((m) =>
    [m.intelligence, m.cost, m.timeSeconds].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    ),
  ).length;
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
    const p = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
      errors = [],
      outbound = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("request", (r) => outbound.push(r.url()));
    await p.clock.install();
    await p.clock.resume();
    let apiCalls = 0;
    let api = {
        ...data,
        retrievedAt: new Date(
          Math.max(Date.now(), Date.parse(data.retrievedAt)) + 1000,
        ).toISOString(),
        models: data.models.map((m) => {
          const next = { ...m };
          delete next.releaseDate;
          return next;
        }),
      },
      fail = false,
      invalid = false;
    await p.route("**/api/data", (r) => {
      apiCalls++;
      return r.fulfill({
        status: fail ? 503 : 200,
        json: invalid ? { models: [] } : api,
      });
    });
    await p.goto(process.env.BASE_URL || "http://127.0.0.1:4173/");
    await p.waitForFunction(() => window.compareLab && window.ready);
    await p.evaluate(() => window.ready);
    const settle = async () => {
      await p.waitForFunction(() => !compareLab.busy);
      await p.waitForTimeout(100);
    };
    await settle();
    await p.evaluate(() => compareLab.pollSnapshot());
    await settle();
    assert.equal(await p.evaluate(() => compareLab.models.length), total);
    const priorCalls = apiCalls;
    await p.clock.fastForward(5 * 60 * 1000 + 1000);
    await p.waitForFunction(() => !compareLab.busy);
    await p.waitForTimeout(100);
    assert.ok(
      apiCalls > priorCalls,
      "five-minute API refresh runs without a page reload",
    );
    assert.ok(
      await p.evaluate(
        () => compareLab.models.filter((m) => m.releaseDate).length > 100,
      ),
      "legacy KV retains known release dates",
    );
    assert.ok(
      (await p.locator("#data-status").innerText()).includes("Cloudflare"),
    );
    assert.ok(
      !outbound.some(
        (url) =>
          url.includes("raw.githubusercontent.com") ||
          url.includes("artificialanalysis.ai"),
      ),
      "browser reads same-origin API only",
    );
    // Existing upstream search, centering, session hiding, and reset remain usable.
    await p.keyboard.press("/");
    const dialog = p.getByRole("dialog");
    await dialog.waitFor();
    const input = dialog.locator("input");
    await input.fill("deep4.1");
    assert.ok((await dialog.innerText()).includes("DeepSeek V4.1"));
    const before = await p.evaluate(() => {
      const c = document.querySelector("#chart3d");
      return {
        ranges: [
          c._fullLayout.scene.xaxis.range,
          c._fullLayout.scene.yaxis.range,
          c._fullLayout.scene.zaxis.range,
        ],
        size: c.data[0].marker.size,
      };
    });
    await input.press("Enter");
    await dialog.waitFor({ state: "hidden" });
    await settle();
    const after = await p.evaluate(() => {
      const c = document.querySelector("#chart3d");
      return {
        ranges: [
          c._fullLayout.scene.xaxis.range,
          c._fullLayout.scene.yaxis.range,
          c._fullLayout.scene.zaxis.range,
        ],
        size: c.data[0].marker.size,
      };
    });
    assert.deepEqual(
      after,
      before,
      "locating preserves bounds and marker sizes",
    );
    await p.mouse.move(1000, 450);
    const id = await p.evaluate(() => {
      const c = document.querySelector("#chart3d"),
        point = c.data[0].customdata[0];
      c.emit("plotly_hover", { points: [{ customdata: point }] });
      return point[4];
    });
    await p.mouse.click(1000, 450, { button: "right" });
    await settle();
    assert.ok(!(await p.evaluate(() => compareLab.selected)).includes(id));
    await p.reload();
    await p.waitForFunction(() => window.compareLab && window.ready);
    await p.evaluate(() => window.ready);
    await settle();
    assert.ok(
      !(await p.evaluate(() => compareLab.selected)).includes(id),
      "context hiding persists in session",
    );
    await p.keyboard.press("r");
    await settle();
    assert.equal(await p.evaluate(() => compareLab.selected.length), total);
    await p.locator("[data-view=top]").click();
    await settle();
    await p.keyboard.press("/");
    await input.fill("deep4.1");
    await input.press("Enter");
    await settle();
    assert.equal(
      await p.evaluate(() => compareLab.active),
      "top",
      "plane search never changes view",
    );
    await p.keyboard.press("/");
    await input.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await p.locator("#language-switch").click();
    await settle();
    await p.keyboard.press("/");
    assert.equal(await input.getAttribute("aria-label"), "Search models");
    await input.press("Escape");
    await p.locator("#theme-switch").click();
    await settle();
    await p.screenshot({ path: "test-results/nuxt-api-dark.png" });
    const chosen = await p.evaluate(() => compareLab.selected);
    fail = true;
    await p.evaluate(() => compareLab.pollSnapshot());
    assert.deepEqual(await p.evaluate(() => compareLab.selected), chosen);
    assert.ok(
      (await p.locator("#data-status").innerText()).includes(
        "keeping snapshot",
      ),
    );
    fail = false;
    invalid = true;
    await p.evaluate(() => compareLab.pollSnapshot());
    assert.equal(await p.evaluate(() => compareLab.models.length), total);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      "test-results/nuxt-integration.json",
      JSON.stringify(
        {
          nuxtHydration: true,
          sameOriginApiOnly: true,
          legacyMetadataRetained: true,
          periodicApiRefresh: true,
          upstreamSearch: true,
          centerPreservesAxesAndSize: true,
          contextHide: true,
          sessionHide: true,
          reset: true,
          planeSearchKeepsView: true,
          searchTranslation: true,
          apiFailureRetainsData: true,
          invalidApiRetainsData: true,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: Nuxt hydration, Cloudflare API, legacy metadata, upstream search/center/hide/reset, API failure retention.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
