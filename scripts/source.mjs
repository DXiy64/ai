import { writeFile, readFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, webcrypto } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { SOURCE, validateSnapshot } from "../src/snapshot.js";

export function extract(html) {
  const flight = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
  ]
    .map((m) => JSON.parse(m[1]))
    .join("");
  const manifests = [
    ...flight.matchAll(/"manifest":(\{"path":"[^"]+"[^}]*\})/g),
  ].map((m) => JSON.parse(m[1]));
  if (manifests.length) return { manifests };
  const marker = '"initialData":';
  const index = flight.indexOf(marker);
  if (index < 0)
    throw new Error(
      "Artificial Analysis page structure changed: initialData missing",
    );
  const start = index + marker.length;
  let depth = 0,
    string = false,
    escape = false;
  for (let end = start; end < flight.length; end++) {
    const c = flight[end];
    if (string) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') string = false;
    } else if (c === '"') string = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0)
      return JSON.parse(flight.slice(start, end + 1));
  }
  throw new Error("Unterminated model data");
}

async function fetchOK(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response;
}

export async function loadManifest(manifest, fixtureDirectory) {
  const url = new URL(manifest.path, SOURCE);
  if (url.origin !== new URL(SOURCE).origin)
    throw new Error("Unexpected payload origin");
  const bytes = fixtureDirectory
    ? await readFile(`${fixtureDirectory}/${url.pathname.split("/").at(-1)}`)
    : Buffer.from(await (await fetchOK(url)).arrayBuffer());
  if (!manifest.key) return JSON.parse(bytes.toString("utf8"));
  // Reproduce the public page loader: its public key, AES-GCM and gzip payload.
  const keyBytes = Buffer.from(manifest.key, "hex");
  const iv = createHash("sha256").update(keyBytes).digest().subarray(0, 12);
  const key = await webcrypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    bytes,
  );
  return JSON.parse(gunzipSync(Buffer.from(plaintext)).toString("utf8"));
}

export function snapshotFromModels(
  raw,
  retrievedAt = new Date().toISOString(),
) {
  if (!Array.isArray(raw)) throw new Error("Full model payload missing");
  return validateSnapshot({
    source: SOURCE,
    methodology: "https://artificialanalysis.ai/methodology",
    retrievedAt,
    scope:
      "Full public model leaderboard including reasoning and effort variants; only complete three-axis models are plotted",
    models: raw.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      shortName: m.shortName,
      creator: m.creator?.name,
      color: m.creator?.color,
      intelligence: m.intelligenceIndex ?? null,
      cost: m.intelligenceIndexCostPerTask?.cost?.total ?? null,
      timeSeconds: m.intelligenceIndexTimePerTask ?? null,
      openWeights: m.isOpenWeights,
      estimated: m.intelligenceIndexIsEstimated ?? false,
      releaseDate:
        m.releaseDate ?? m.release_date ?? m.modelReleaseDate ?? null,
    })),
  });
}

export async function refreshData({
  htmlFile,
  fixtureDirectory,
  output = new URL("../src/data.json", import.meta.url),
} = {}) {
  const html = htmlFile
    ? await readFile(htmlFile, "utf8")
    : await (await fetchOK(SOURCE)).text();
  const extracted = extract(html);
  let raw = Array.isArray(extracted) ? extracted : null;
  if (extracted.manifests) {
    const results = await Promise.all(
      extracted.manifests.map((m) => loadManifest(m, fixtureDirectory)),
    );
    raw = results.find((payload) => Array.isArray(payload.models))?.models;
  }
  const next = snapshotFromModels(raw);
  // Avoid hourly commits when model data has not changed.
  try {
    const previous = validateSnapshot(
      JSON.parse(await readFile(output, "utf8")),
    );
    if (JSON.stringify(previous.models) === JSON.stringify(next.models))
      return previous;
  } catch {
    /* Missing/invalid old snapshots can be replaced by validated data. */
  }
  const target = output instanceof URL ? fileURLToPath(output) : output;
  await writeFile(target + ".tmp", JSON.stringify(next, null, 2) + "\n");
  await rename(target + ".tmp", target);
  return next;
}
