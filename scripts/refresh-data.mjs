import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export function extract(html) {
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  const manifests = [...flight.matchAll(/"manifest":(\{"path":"[^"]+"[^}]*\})/g)].map(m=>JSON.parse(m[1]));
  if (manifests.length) return { manifests };
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
  const response = await fetch('https://artificialanalysis.ai/models/', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.text();
})();
// AA's public page loader downloads AES-GCM + gzip payloads using keys supplied
// in the public HTML. Reproduce that loader; no login or API key is required.
async function loadManifest(manifest) {
  const bytes = process.argv[3] ? await readFile(`${process.argv[3]}/${manifest.path.split('/').at(-1)}`) : await (async()=>{
    const response = await fetch(new URL(manifest.path,'https://artificialanalysis.ai'),{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Model payload returned HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  })();
  if(!manifest.key)return JSON.parse(bytes.toString('utf8'));
  const keyBytes=Buffer.from(manifest.key,'hex');
  const iv=createHash('sha256').update(keyBytes).digest().subarray(0,12);
  const key=await webcrypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['decrypt']);
  const plaintext=await webcrypto.subtle.decrypt({name:'AES-GCM',iv,tagLength:128},key,bytes);
  return JSON.parse(gunzipSync(Buffer.from(plaintext)).toString('utf8'));
}
const extracted=extract(html);
let raw=Array.isArray(extracted)?extracted:null;
if(extracted.manifests){
  const results=await Promise.all(extracted.manifests.map(loadManifest));
  const modelPayload=results.find(payload=>Array.isArray(payload.models));
  if(!modelPayload)throw new Error('Full model payload missing; previous snapshot preserved');
  raw=modelPayload.models;
}
if(!Array.isArray(raw)||raw.length<100)throw new Error('Full leaderboard unavailable; previous snapshot preserved');
const models = raw.map(m => ({id:m.id, slug:m.slug, name:m.name, shortName:m.shortName, creator:m.creator.name, color:m.creator.color, intelligence:m.intelligenceIndex ?? null, cost:m.intelligenceIndexCostPerTask?.cost?.total ?? null, timeSeconds:m.intelligenceIndexTimePerTask ?? null, openWeights:m.isOpenWeights, estimated:m.intelligenceIndexIsEstimated ?? false}));
const valid = models.filter(m => [m.intelligence,m.cost,m.timeSeconds].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
if (valid.length < 100) throw new Error('Too few complete models; previous snapshot preserved');
if(new Set(models.map(m=>m.id)).size!==models.length)throw new Error('Duplicate model IDs; previous snapshot preserved');
await writeFile(fileURLToPath(new URL('../src/data.json',import.meta.url)), JSON.stringify({source:'https://artificialanalysis.ai/models/', methodology:'https://artificialanalysis.ai/methodology', retrievedAt:new Date().toISOString(), scope:'Full public model leaderboard including reasoning and effort variants; only complete three-axis models are plotted', models},null,2)+'\n');
console.log(`Saved ${models.length} models; ${valid.length} have all three metrics.`);
