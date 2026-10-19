# ai · 3D Model Chart

Explore AI models by Intelligence Index, Cost per Task (USD), and Time per Task (minutes).

Live site: [ai.mou7s.com](https://ai.mou7s.com)

## Using the chart

- Drag to rotate, scroll to zoom, and hover over a point to inspect its metrics.
- Use the fixed upper-left menu or press `1` for intelligence/time, `2` for cost/time, `3` for intelligence/cost, and `4` to return to free 3D. Planes are independent 2D plots: drag only pans, scroll zooms at the cursor from 1–50×, and better values point toward the upper right. Reset view fits the visible points with padding. Point sizes scale within readable limits; there is no snapping or drag-to-3D switch.
- Press `/` to search by model or provider. Search ignores case and splits letters from numbers, so `deep4.1` matches DeepSeek V4.1 Flash.
- Use ↑ / ↓ to select a search result, Enter to locate it, and Esc to close search. Results show intelligence, cost, and time; unavailable metrics appear as `—` and cannot be located.
- Double-click a point to center the camera without changing axis bounds or marker sizes.
- Right-click a point to hide it for the current browser session. Searching for a hidden model and selecting it restores it.
- Press R to show all models and reset the current view. Shortcuts do not interrupt typing in the search field.

Axes use muted blue (intelligence), green (cost), and purple (time). Bounds start at zero and end on regular ticks. The **Ideal corner** marks the direction of higher intelligence, lower cost, and less time; it is not a combined model ranking.

## Data

Source: [Artificial Analysis](https://artificialanalysis.ai/models/). The checked-in snapshot contains 704 models and reasoning variants, of which 187 have all three required metrics. Missing values are never replaced with zero. Snapshot timestamps and original precision are retained in `src/data.json`; the live snapshot can differ after scheduled updates.

Cost comes from `intelligenceIndexCostPerTask.cost.total`; time comes from `intelligenceIndexTimePerTask` in seconds and is converted to minutes for display. Time measures weighted decoding time, excluding TTFT and other overhead. See the [source methodology](https://artificialanalysis.ai/methodology).

## Local development

Nuxt 4, Vue 3, and Plotly, with Bun 1.4.3 for dependencies, development, and static generation. Node.js >= 24.5 is required for the data refresh script and deployment tooling.

```sh
bun install --frozen-lockfile
bun run dev
```

Development runs at http://127.0.0.1:3000. The chart loads only in the browser. `bun run build` generates `.output/public`; `bun run preview` previews the generated site. The local Nuxt server does not run the production Worker's `/api/data` endpoint, so the chart falls back to its bundled snapshot.

## Deployment on push

Production uses Cloudflare Workers with Static Assets and the `MODEL_DATA` KV namespace configured in `wrangler.jsonc`. Cloudflare runs the Worker, not Bun.

Connect the existing `ai` Worker to Git using these Cloudflare Workers Builds settings:

| Setting           | Value                               |
| ----------------- | ----------------------------------- |
| Repository        | `Mou7s/ai`                          |
| Production branch | `main`                              |
| Root directory    | Repository root                     |
| Build command     | `bun run build`                     |
| Deploy command    | `npx wrangler deploy`               |
| Disable builds    | Off                                 |
| Preview builds    | Off for production-only deployments |

Once connected, pushing to `main` triggers a Cloudflare build and deployment to `ai.mou7s.com`. Check the Worker's Builds page for the commit, logs, and deployment result. Authentication is managed by Cloudflare Workers Builds; no GitHub Actions deployment token is needed. This repository intentionally has no separate GitHub Actions deployment workflow.

For manual deployment, run `bunx wrangler login`, then `bun run deploy`. The existing account, custom domain, KV namespace, and Cron schedule are declared in `wrangler.jsonc`.

## Scheduled data refresh

Cloudflare Cron refreshes model data every six hours (02:00, 08:00, 14:00, and 20:00 Asia/Shanghai). Valid snapshots are written to Workers KV. `/api/data` serves the current snapshot with a five-minute cache; unavailable KV data falls back to the deployed snapshot. Failed refreshes preserve the last successful snapshot.

Scheduled refreshes do not change the Git snapshot or deploy code. The page checks the same-origin API every five minutes while visible and when it becomes visible. Valid newer data is applied without losing model visibility; invalid, older or unavailable snapshots retain the current data. This does not add a scraper or modify Cloudflare's existing six-hour schedule. Inspect scheduled task logs in the Worker's Observability page and schedules in Triggers.

To refresh the checked-in snapshot manually:

```sh
bun run refresh-data
bun run check
```

The refresh script uses Node's `--use-env-proxy`, reads public source data, and needs no source API key. Source format changes or insufficient valid data cause it to fail without replacing the snapshot.

## Validation

```sh
bun run check
node --test tests/worker.test.mjs
bun run build
bunx wrangler deploy --dry-run
```

For a local scheduled refresh, run `bunx wrangler dev --test-scheduled` and request `/cdn-cgi/mf/scheduled`. Local KV is separate from production.
