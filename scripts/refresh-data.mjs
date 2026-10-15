import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function extract(html) {
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  const marker = '"initialData":';
  const index = flight.indexOf(marker);
  if (index < 0) throw new Error('Artificial Analysis page structure changed: initialData missing');
  const start = index + marker.length;
  let depth = 0, string = false, escape = false;
  for (let end = start; end < flight.length; end++) {
    const c = flight[end];
    if (string) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') string = false; }
    else if (c === '"') string = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return JSON.parse(flight.slice(start, end + 1));
  }
  throw new Error('Unterminated model data');
}

const html = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (async () => {
  const response = await fetch('https://artificialanalysis.ai/', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.text();
})();
const raw = extract(html);
const models = raw.map(m => ({id:m.id, slug:m.slug, name:m.name, shortName:m.shortName, creator:m.creator.name, color:m.creator.color, intelligence:m.intelligenceIndex ?? null, cost:m.intelligenceIndexCostPerTask?.cost?.total ?? null, timeSeconds:m.intelligenceIndexTimePerTask ?? null, openWeights:m.isOpenWeights, estimated:m.intelligenceIndexIsEstimated ?? false}));
const valid = models.filter(m => [m.intelligence,m.cost,m.timeSeconds].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
if (valid.length < 5) throw new Error('Too few complete models; previous snapshot preserved');
await writeFile(fileURLToPath(new URL('../src/data.json',import.meta.url)), JSON.stringify({source:'https://artificialanalysis.ai/', methodology:'https://artificialanalysis.ai/methodology', retrievedAt:new Date().toISOString(), scope:'Public homepage featured models; not the full leaderboard', models},null,2)+'\n');
console.log(`Saved ${models.length} featured models; ${valid.length} have all three metrics.`);
