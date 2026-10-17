import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  extract,
  loadManifest,
  refreshData,
  snapshotFromModels,
} from "../scripts/source.mjs";
import { validateSnapshot } from "../src/snapshot.js";

const raw = () =>
  Array.from({ length: 101 }, (_, i) => ({
    id: String(i),
    name: "Model " + i,
    creator: { name: "Test" },
    intelligenceIndex: 30,
    intelligenceIndexCostPerTask: { cost: { total: 1 } },
    intelligenceIndexTimePerTask: 60,
    releaseDate: "2026-10-01",
  }));
const page = (models) =>
  "self.__next_f.push([1," +
  JSON.stringify('x"initialData":' + JSON.stringify(models)) +
  "])";

test("extract structured data with escaped strings and bracket characters", () => {
  const models = raw();
  models[0].name = 'hello ] "world"';
  assert.deepEqual(extract(page(models)), models);
  assert.throws(() => extract("changed source page"));
});

test("snapshot carries release dates, keeps null metrics, rejects invalid and duplicate records", () => {
  const models = raw();
  models[0].intelligenceIndex = null;
  const data = snapshotFromModels(models);
  assert.equal(data.models[0].releaseDate, "2026-10-01");
  assert.equal(data.models[0].intelligence, null);
  assert.throws(() =>
    validateSnapshot({ ...data, models: [...data.models, data.models[0]] }),
  );
  assert.throws(() =>
    snapshotFromModels([{ ...models[0], creator: null }, ...models.slice(1)]),
  );
  assert.throws(() =>
    snapshotFromModels(
      models.map((m) => ({ ...m, intelligenceIndex: Infinity })),
    ),
  );
  assert.throws(() => snapshotFromModels(models.slice(0, 99)));
});

test("encrypted public manifest is decoded and foreign payload origins rejected", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-source-"));
  try {
    const keyBytes = Buffer.alloc(32, 7),
      iv = createHash("sha256").update(keyBytes).digest().subarray(0, 12);
    const key = await webcrypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );
    const bytes = await webcrypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      gzipSync(JSON.stringify({ models: raw() })),
    );
    await writeFile(path.join(root, "payload.bin"), Buffer.from(bytes));
    const decoded = await loadManifest(
      { path: "/payload.bin", key: keyBytes.toString("hex") },
      root,
    );
    assert.equal(decoded.models.length, 101);
    await assert.rejects(
      loadManifest({ path: "https://example.com/payload.bin" }, root),
      /origin/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refresh writes validated data atomically, skips unchanged data, retains snapshot on failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-refresh-"));
  try {
    const output = path.join(root, "data.json"),
      htmlFile = path.join(root, "page.html");
    const previous = snapshotFromModels(raw(), "2026-01-01T00:00:00Z");
    await writeFile(output, JSON.stringify(previous));
    await writeFile(htmlFile, page(raw()));
    assert.equal(
      (await refreshData({ htmlFile, output })).retrievedAt,
      previous.retrievedAt,
    );
    const changed = raw();
    changed[0].releaseDate = "2026-10-16";
    await writeFile(htmlFile, page(changed));
    await refreshData({ htmlFile, output });
    const saved = await readFile(output, "utf8");
    assert.equal(JSON.parse(saved).models[0].releaseDate, "2026-10-16");
    await writeFile(htmlFile, page([]));
    await assert.rejects(refreshData({ htmlFile, output }));
    assert.equal(await readFile(output, "utf8"), saved);
    await writeFile(htmlFile, "source format changed");
    await assert.rejects(refreshData({ htmlFile, output }));
    assert.equal(await readFile(output, "utf8"), saved);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
