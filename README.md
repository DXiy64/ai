# ai · 3D Model Chart

Explore AI models by Intelligence Index, Cost per Task (USD), and Time per Task (minutes).

Live site: [ai.mou7s.com](https://ai.mou7s.com)

## Using the chart

- Use the upper-left menu to switch between free 3D, intelligence/time, cost/time, and intelligence/cost. Free 3D rotates; plane views only pan and never switch view on drag. There is no angle snapping.
- Plane views consistently place better values at the upper right. Cost and time axes are reversed without changing their real values or units. Changing the selection automatically fits every selected point and connecting line with screen-space padding; single or coincident points stay centered. The Reset view button (or clicking the active view) restores this frame. Scroll zooms at the cursor from 1–50× relative to that fitted frame, with bounded panning. Manual zoom/pan is preserved through language/theme changes and resize. Points and lines grow within readable limits rather than scaling without a cap. Padding around zero does not introduce negative metric labels or change model values.
- Models default to all selected. Search and filter by series, latest/previous versions, specific version, and effort level. Lines connect effort levels only within one version in planes; 3D shows points only. Newest versions without complete metrics are marked unavailable, not silently replaced by older releases.
- Latest classification uses release dates when available, otherwise recognized version order; ambiguous versions remain unverified. Language (Chinese/English) and theme (light/dark) are saved locally; switching them preserves the current selection and viewport.
- Press `/` to search by model or provider. Search ignores case and splits letters from numbers, so `deep4.1` matches DeepSeek V4.1 Flash.
- Use ↑ / ↓ to select a search result, Enter to locate it, and Esc to close search. Results show intelligence, cost, and time; unavailable metrics appear as `—` and cannot be located.
- Double-click a point in free 3D to center the camera without changing axis bounds or marker sizes. Search also locates points in planes without changing the current view.
- Right-click a point to hide it for the current browser session. Searching for a hidden model and selecting it restores it.
- Press R to show all models and reset the current view. Shortcuts do not interrupt typing in the search field.

3D axes use muted blue (intelligence), green (cost), and purple (time). Bounds start at zero and cover the full valid dataset, including on first load and after live updates. The **Ideal corner** marks the direction of higher intelligence, lower cost, and less time; it is not a combined model ranking.

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

Scheduled refreshes do not change the Git snapshot or deploy code. The browser reads the same-origin `/api/data` on load, every five minutes, and when the page becomes visible. Invalid, older, or unavailable responses retain the current snapshot and selection. Inspect scheduled task logs in the Worker's Observability page and schedules in Triggers.

The existing fetcher now retains `releaseDate` for version classification. The bundled snapshot restores previously recorded release metadata by stable model ID without changing upstream metrics. Legacy KV snapshots that omit that field retain known dates in the browser until the next successful scheduled refresh; unknown dates are not invented. No additional GitHub Actions fetcher, scraper, or GitHub raw-data polling is used.

To refresh the checked-in snapshot manually:

```sh
bun run refresh-data
bun run check
```

The refresh script uses Node's `--use-env-proxy`, reads public source data, and needs no source API key. Source format changes or insufficient valid data cause it to fail without replacing the snapshot.

## Validation

```sh
bun run check
bun run test
bun run build
bunx wrangler deploy --dry-run
```

For a local scheduled refresh, run `bunx wrangler dev --test-scheduled` and request `/cdn-cgi/mf/scheduled`. Local KV is separate from production.

For browser tests, run `bunx playwright install chromium`, serve the generated site (or run the local Worker), then run `BASE_URL=http://127.0.0.1:3000 bun run test:ui`. Set `PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome. Reports and screenshots go to ignored `test-results/`. Tests cover Nuxt hydration, the existing Cloudflare API and fallback, legacy release metadata, model selection, plane zoom/panning, preferences, and upstream search/center/hide/reset behavior.
