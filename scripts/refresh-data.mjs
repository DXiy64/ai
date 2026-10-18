import { writeFile } from 'node:fs/promises';
import { fetchSnapshot } from '../lib/model-data.mjs';
const data = await fetchSnapshot();
await writeFile(new URL('../src/data.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log(`Saved ${data.models.length} models.`);
