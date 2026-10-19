export const complete = (m) =>
  [m.intelligence, m.cost, m.timeSeconds].every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
export const identity = (m) => m.id;
export function buildCatalog(entries) {
  const models = entries
    .filter(complete)
    .map((m) => ({ ...m, effort: "standard", rank: null }));
  const creators = [...new Set(models.map((m) => m.creator))].sort();
  const families = creators.map((creator, index) => {
    const group = models.filter((m) => m.creator === creator);
    return {
      index,
      key: creator,
      name: creator,
      creator,
      models: group,
      entries: group,
      color: group[0]?.color || "#4386d0",
      lineColor: group[0]?.color || "#4386d0",
    };
  });
  return { models, families, series: [] };
}
