import { readFile } from "node:fs/promises";
import { validateSnapshot } from "../src/snapshot.js";
const data = validateSnapshot(
  JSON.parse(
    await readFile(new URL("../src/data.json", import.meta.url), "utf8"),
  ),
);
const complete = data.models.filter((m) =>
  [m.intelligence, m.cost, m.timeSeconds].every((v) => v !== null),
);
console.log(
  "Data verified: " +
    data.models.length +
    " unique models, " +
    complete.length +
    " complete.",
);
