export const SOURCE = "https://artificialanalysis.ai/models/";
export function validateSnapshot(data) {
  if (
    !data ||
    data.source !== SOURCE ||
    !Array.isArray(data.models) ||
    data.models.length < 100 ||
    !Number.isFinite(Date.parse(data.retrievedAt))
  )
    throw Error("Invalid model snapshot");
  const ids = new Set();
  let complete = 0;
  for (const m of data.models) {
    if (
      !m ||
      typeof m.id !== "string" ||
      typeof m.name !== "string" ||
      typeof m.creator !== "string" ||
      ids.has(m.id)
    )
      throw Error("Invalid or duplicate model");
    ids.add(m.id);
    for (const v of [m.intelligence, m.cost, m.timeSeconds])
      if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0))
        throw Error("Invalid metric");
    if ([m.intelligence, m.cost, m.timeSeconds].every((v) => v !== null))
      complete++;
  }
  if (complete < 100) throw Error("Too few complete models");
  return data;
}
