import { refreshData } from "./source.mjs";
const data = await refreshData({
  htmlFile: process.argv[2],
  fixtureDirectory: process.argv[3],
});
const complete = data.models.filter((m) =>
  [m.intelligence, m.cost, m.timeSeconds].every((v) => v !== null),
);
console.log(
  "Snapshot: " +
    data.models.length +
    " models; " +
    complete.length +
    " complete; " +
    data.retrievedAt,
);
