const ranks = {
  "non-reasoning": 0,
  reasoning: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};
const complete = (m) =>
  [m.intelligence, m.cost, m.timeSeconds].every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
function identity(m) {
  const match = m.name.match(
      /^(.*?)\s*\((Non-reasoning|Reasoning|Low|Medium|High|Xhigh|Max)(?:,\s*(.*?))?\)$/i,
    ),
    name = match ? match[1] : m.name,
    mode = match ? match[2].toLowerCase() : null,
    qualifier = match?.[3] || "";
  return {
    key: [m.creator, name, qualifier.toLowerCase()].join("|"),
    name,
    mode,
    qualifier,
  };
}
function seriesIdentity(name) {
  let m;
  if (
    (m = name.match(
      /^Claude\s+(?:(\d+(?:\.\d+)*)\s+(Sonnet|Opus|Haiku|Fable)|(Sonnet|Opus|Haiku|Fable)\s+(\d+(?:\.\d+)*))(.*)$/i,
    ))
  )
    return {
      label: "Claude " + (m[2] || m[3]),
      version: (m[1] || m[4]).split(".").map(Number),
      revision: revision(m[5]),
      known: !m[5].trim() || /^\s*\([^)]*\)\s*$/.test(m[5]),
    };
  if ((m = name.match(/^GPT[-\s]?(\d+(?:\.\d+)*)(.*)$/i))) {
    const tail = m[2]
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(?:preview|experimental)\b/gi, "")
      .trim();
    return {
      label: tail ? "GPT " + tail : "GPT",
      version: m[1].split(".").map(Number),
      revision: revision(m[2]),
      known: true,
    };
  }
  if ((m = name.match(/^DeepSeek\s+([VR])(\d+(?:\.\d+)*)(.*)$/i))) {
    const tail = m[3]
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(?:20\d{2}[-/]\d{2}[-/]\d{2}|\d{4})\b/g, "")
      .trim();
    return {
      label: "DeepSeek " + m[1].toUpperCase() + (tail ? " " + tail : ""),
      version: m[2].split(".").map(Number),
      revision: revision(m[3]),
      known: true,
    };
  }
  // A size (e.g. 27B) is a product variant, not a release number.
  m = name.match(/^([^\d]*?)(\d+(?:\.\d+)*)(.*)$/);
  if (m && m[1].trim() && !/^[BbTt](?:\b|\s)/.test(m[3])) {
    const tail = m[3]
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(?:preview|experimental)\b/gi, "")
      .replace(/\b(?:20\d{2}[-/]\d{2}[-/]\d{2}|\d{4})\b/g, "")
      .replace(/^[-\s]+|[-\s]+$/g, "");
    return {
      label: (
        m[1].trim().replace(/[-\s]+$/, "") + (tail ? " " + tail : "")
      ).replace(/\s+/g, " "),
      version: m[2].split(".").map(Number),
      revision: revision(m[3]),
      known: !/^Grok\s*4\.\d{2,}/i.test(name),
    };
  }
  return { label: name, version: null, revision: [], known: false };
}
function revision(text) {
  const iso = text.match(/\b(20\d{2})[-/]?(\d{2})[-/]?(\d{2})\b/);
  if (iso) return iso.slice(1).map(Number);
  const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ],
    month = text.match(
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*'?\s*(\d{4}|\d{2})\b/i,
    );
  if (month)
    return [
      (+month[2] < 100 ? 2000 : 0) + +month[2],
      months.indexOf(month[1].toLowerCase()) + 1,
    ];
  const stamp = text.match(/\b(\d{4})\b/);
  return stamp ? [+stamp[1]] : [];
}
function release(m) {
  const raw = m.releaseDate ?? m.release_date ?? m.modelReleaseDate;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}(?:-\d{2})?(?:T.*)?$/.test(raw))
    return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}
function tuple(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
function compareVersion(a, b, useDates) {
  if (useDates && a.released !== b.released)
    return Math.sign(a.released - b.released);
  const core = tuple(a.version || [], b.version || []);
  return core || tuple(a.revision, b.revision);
}
function hash(text) {
  let h = 2166136261;
  for (const c of text) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function buildCatalog(entries) {
  const map = new Map();
  for (const m of entries) {
    if (
      !m ||
      typeof m.id !== "string" ||
      typeof m.name !== "string" ||
      typeof m.creator !== "string"
    )
      continue;
    const id = identity(m);
    if (!map.has(id.key)) {
      const s = seriesIdentity(id.name);
      map.set(id.key, {
        ...id,
        ...s,
        name: id.name,
        creator: m.creator,
        seriesKey: m.creator + "|" + s.label,
        entries: [],
        models: [],
        released: null,
      });
    }
    const f = map.get(id.key),
      entry = {
        ...m,
        effort: id.mode,
        rank: id.mode === null ? null : ranks[id.mode],
      };
    f.entries.push(entry);
    if (complete(m)) f.models.push(entry);
    const date = release(m);
    if (date !== null) f.released = Math.min(f.released ?? Infinity, date);
  }
  const families = [...map.values()]
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en", { numeric: true }) ||
        a.key.localeCompare(b.key),
    )
    .map((f, index) => {
      const hue = (hash(f.key) / 4294967296) * 360;
      return {
        ...f,
        index,
        color: `hsl(${hue}, 60%, 44%)`,
        lineColor: `hsla(${hue}, 60%, 44%, .48)`,
        models: f.models.sort(
          (a, b) =>
            (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name),
        ),
        entries: f.entries.sort(
          (a, b) =>
            (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name),
        ),
      };
    });
  const roots = new Map();
  for (const f of families) {
    if (!roots.has(f.seriesKey))
      roots.set(f.seriesKey, {
        key: f.seriesKey,
        name: f.label,
        creator: f.creator,
        versions: [],
      });
    roots.get(f.seriesKey).versions.push(f);
  }
  const series = [...roots.values()]
    .filter((s) => s.versions.some((v) => v.models.length))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en", { numeric: true }) ||
        a.creator.localeCompare(b.creator),
    )
    .map((s, index) => {
      const useDates = s.versions.every((v) => v.released !== null),
        sortable = s.versions.filter((v) => v.known || useDates),
        sorted = [...sortable].sort(
          (a, b) =>
            compareVersion(b, a, useDates) || a.name.localeCompare(b.name),
        );
      let latest = sorted.length
        ? sorted.filter((v) => compareVersion(v, sorted[0], useDates) === 0)
        : [];
      if (s.versions.length === 1) latest = s.versions;
      const latestKeys = new Set(latest.map((v) => v.key));
      return {
        ...s,
        index,
        basis: useDates
          ? "发布日期"
          : sortable.length
            ? "版本号"
            : "仅收录此版本",
        latest,
        old: sorted.filter((v) => !latestKeys.has(v.key)),
        unknown: s.versions.filter(
          (v) => !latestKeys.has(v.key) && !sortable.includes(v),
        ),
        versions: [...s.versions].sort(
          (a, b) =>
            compareVersion(b, a, useDates) || a.name.localeCompare(b.name),
        ),
      };
    });
  return { models: entries.filter(complete), families, series };
}
export { identity, seriesIdentity, buildCatalog, compareVersion, complete };
