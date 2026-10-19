import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "../app/lib/catalog.js";

const model = (name, releaseDate, extra = {}) => ({
  id: name,
  name,
  releaseDate,
  creator: "Test",
  intelligence: 40,
  cost: 1,
  timeSeconds: 60,
  ...extra,
});
const find = (catalog, name) => catalog.series.find((s) => s.name === name);

test("release dates rank versions; effort modes share one version; product lines stay separate", () => {
  const catalog = buildCatalog([
    model("GPT-6.1 Sol (Low)", "2026-10-01"),
    model("GPT-6.1 Sol (High)", "2026-10-01"),
    model("GPT-6.2 Sol (Low)", "2026-10-15"),
    model("GPT-99 Sol (Low)", "2020-01-01"),
    model("GPT-6.1 Luna (Low)", "2026-10-16"),
    model("Claude 3.5 Sonnet", "2024-01-01"),
    model("Claude Sonnet 4.5", "2025-01-01"),
  ]);
  const sol = find(catalog, "GPT Sol");
  assert.deepEqual(
    sol.latest.map((v) => v.name),
    ["GPT-6.2 Sol"],
  );
  assert.equal(sol.old.find((v) => v.name === "GPT-6.1 Sol").models.length, 2);
  assert.ok(find(catalog, "GPT Luna"));
  assert.equal(
    find(catalog, "Claude Sonnet").latest[0].name,
    "Claude Sonnet 4.5",
  );
});

test("new releases promote automatically, preserve colours, and incomplete newest versions are not replaced with older ones", () => {
  const old = [model("GPT-6.1 Sol (Low)", "2026-10-01")];
  const before = buildCatalog(old),
    after = buildCatalog([
      ...old,
      model("GPT-6.2 Sol (Low)", "2026-10-15", { cost: null }),
    ]);
  assert.equal(find(after, "GPT Sol").latest[0].name, "GPT-6.2 Sol");
  assert.equal(find(after, "GPT Sol").latest[0].models.length, 0);
  assert.equal(find(after, "GPT Sol").old[0].name, "GPT-6.1 Sol");
  assert.equal(
    before.families[0].color,
    after.families.find((f) => f.name === "GPT-6.1 Sol").color,
  );
});

test("missing dates use numeric versions; ambiguous versions remain unverified", () => {
  const catalog = buildCatalog([
    model("GPT-6.9 Sol (Low)", null),
    model("GPT-6.10 Sol (Low)", null),
    model("Grok 4.20 0309", null),
    model("Grok 4.7", null),
    model("Qwen3 8B", null),
    model("Qwen3 32B", null),
  ]);
  assert.equal(find(catalog, "GPT Sol").latest[0].name, "GPT-6.10 Sol");
  assert.equal(find(catalog, "Grok").unknown[0].name, "Grok 4.20 0309");
  assert.ok(find(catalog, "Qwen 8B") && find(catalog, "Qwen 32B"));
});
