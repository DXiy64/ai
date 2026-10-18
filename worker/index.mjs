import fallbackData from '../src/data.json' with { type: 'json' };
import { fetchSnapshot } from '../lib/model-data.mjs';

const SNAPSHOT_KEY = 'models:latest';
export async function refresh(env) {
  // Only replace the previous snapshot after the complete fetch passes validation.
  const data = await fetchSnapshot();
  await env.MODEL_DATA.put(SNAPSHOT_KEY, JSON.stringify(data));
  console.log(JSON.stringify({ event: 'data-refreshed', retrievedAt: data.retrievedAt, models: data.models.length }));
  return data;
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/data') return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    let data;
    try { data = await env.MODEL_DATA.get(SNAPSHOT_KEY); }
    catch (error) { console.error('Snapshot read failed', error); }
    return new Response(request.method === 'HEAD' ? null : (data || JSON.stringify(fallbackData)), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    });
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refresh(env));
  },
};
