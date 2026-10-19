import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { refresh } from '../worker/index.mjs';

test('API serves stored snapshot and falls back when KV is unavailable', async () => {
  const request = new Request('https://example.com/api/data');
  const response = await worker.fetch(request, { MODEL_DATA: { get: async () => '{"models":["stored"]}' } });
  assert.deepEqual(await response.json(), { models: ['stored'] });
  const fallback = await worker.fetch(request, { MODEL_DATA: { get: async () => null } });
  assert.ok((await fallback.json()).models.length >= 100);
});

test('failed source fetch never overwrites last good snapshot; valid data is published', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  const env = { MODEL_DATA: { put: async (...args) => writes.push(args) } };
  try {
    globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
    await assert.rejects(refresh(env), /503/);
    assert.equal(writes.length, 0);
    globalThis.fetch = async () => new Response('page structure changed');
    await assert.rejects(refresh(env), /initialData missing/);
    assert.equal(writes.length, 0);
    const models = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Model ${i}`, creator: { name: 'Test' }, intelligenceIndex: 10, intelligenceIndexCostPerTask: { cost: { total: 1 } }, intelligenceIndexTimePerTask: 60, releaseDate:'2026-10-01' }));
    models[1].release_date='2026-10-02';delete models[1].releaseDate;
    const flight = `"initialData":${JSON.stringify(models)}`;
    globalThis.fetch = async () => new Response(`self.__next_f.push([1,${JSON.stringify(flight)}])`);
    await refresh(env);
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0][1]).models.length, 100);
    assert.equal(JSON.parse(writes[0][1]).models[0].releaseDate, '2026-10-01');
    assert.equal(JSON.parse(writes[0][1]).models[1].releaseDate, '2026-10-02');
  } finally { globalThis.fetch = originalFetch; }
});
