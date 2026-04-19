# Provider Lab Feature Status

Last updated: 2026-04-17

Primary plan: [PLAN_2026-04-17_PROVIDER_EXPERIMENT_MVP.md](/Users/jeremymartin/Documents/Cursor/render-engine/PLAN_2026-04-17_PROVIDER_EXPERIMENT_MVP.md)

## Goal

Build an MVP Provider Lab in `render-engine` to evaluate alternative reel-template providers against real `social-posting-v2` posts, without touching production rotation, theme assignment, or rollout.

## Current Status

The Hyperframes-first MVP harness is now mostly implemented and usable, but the full plan is not yet complete.

What works today:

- `social-posting-v2` exposes a read-only experiment snapshot endpoint for a post by ID.
- `social-posting-v2` exposes a read-only recent experiment-post list endpoint filtered by status.
- `render-engine` proxies that snapshot through the existing designer/V2 bridge.
- `render-engine` proxies recent experiment posts through the same designer/V2 bridge.
- `render-engine` has a new `Provider Lab` workspace in the designer shell.
- Hyperframes is wired as the first real provider implementation.
- Provider Lab can:
  - load a real V2 post snapshot by post ID
  - browse recent ready V2 posts and load one into the snapshot panel
  - choose between multiple Hyperframes templates from a registry-backed picker
  - render a Hyperframes preview MP4 plus poster
  - render and save a final Hyperframes run
  - persist template metadata into saved run manifests
  - save a manifest JSON with run metadata
  - list recent saved runs and pin two runs for side-by-side comparison
- Remotion exists only as a stubbed provider entry.

## Implemented

### `social-posting-v2`

Implemented route:

- `GET /api/admin/experiment-posts/:id`
- `GET /api/admin/experiment-posts?limit=...&status=...`

Implemented behavior:

- returns a flattened renderer-friendly snapshot
- returns recent renderer-friendly post summaries for Provider Lab browsing
- resolves public media URLs server-side
- includes:
  - post metadata
  - content title, subtitle, body
  - org brand fields
  - source/reel media URLs
  - platform context

Implemented files:

- [`/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2/src/routes/api/admin/posts.ts`](/Users/jeremymartin/Documents/Cursor/In%20Production/social-posting-v2/src/routes/api/admin/posts.ts:319)
- [`/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2/tests/experiment-posts.test.ts`](/Users/jeremymartin/Documents/Cursor/In%20Production/social-posting-v2/tests/experiment-posts.test.ts:1)

### `render-engine`

Implemented shell/routes:

- designer shell route:
  - `GET /designer/provider-lab`
- V2 bridge proxy:
  - `GET /api/designer/v2/post?id=<postId>`
  - `GET /api/designer/v2/posts/recent?limit=...&status=...`
- Provider Lab API:
  - `GET /api/designer/provider-lab/providers`
  - `GET /api/designer/provider-lab/runs`
  - `POST /api/designer/provider-lab/preview`
  - `POST /api/designer/provider-lab/render`

Implemented provider/runtime layer:

- provider abstraction:
  - [`src/providers/types.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/types.ts:1)
  - [`src/providers/index.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/index.ts:1)
- Hyperframes provider:
  - [`src/providers/hyperframes.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/hyperframes.ts:1)

Implemented Hyperframes templates:

- `hyperframes-basic-v1`
- `hyperframes-split-panel-v1`

Implemented persistence:

- Provider Lab run save/list service:
  - [`src/services/provider-lab.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/services/provider-lab.ts:1)
- saved artifacts:
  - MP4
  - poster PNG
  - `manifest.json`
- local fallback path:
  - `/tmp/render-output/experiments/...`

Implemented UI:

- Provider Lab workspace shell:
  - [`public/designer.html`](/Users/jeremymartin/Documents/Cursor/render-engine/public/designer.html:2196)
- Provider Lab client logic:
  - [`public/designer-app.js`](/Users/jeremymartin/Documents/Cursor/render-engine/public/designer-app.js:2032)
- bridge method:
  - [`public/designer-v2-bridge.js`](/Users/jeremymartin/Documents/Cursor/render-engine/public/designer-v2-bridge.js:286)

Implemented capabilities in the UI:

- choose provider
- choose a provider template from the registry returned by the Provider Lab API
- load V2 post snapshot by ID
- browse recent ready V2 posts and load one into the post-id field
- run Hyperframes preview
- run final Hyperframes render
- inspect the selected template metadata in the preview panel
- inspect raw snapshot JSON
- play preview video
- inspect recent saved runs
- pin two saved runs into a side-by-side compare surface

## Not Yet Implemented

### Template management

- duplicate/edit/create provider templates
- template metadata persisted separately from render runs

### Provider depth

- Remotion implementation
- provider-specific input mapping beyond the current first-pass Hyperframes template set
- soundtrack toggle or provider-level audio options
- aspect-ratio options

### Review UX

- richer run gallery beyond the current list-plus-compare layout
- inline manifest viewer inside Provider Lab
- clearer render failure/debug inspection in the UI
- review notes or verdict capture on saved runs

### Production-adjacent work intentionally not started

- production rollout
- rotation logic
- theme/category assignment
- writing provider templates back into V2 `render_templates`
- scheduling/publishing integration

## Known Constraints

- Hyperframes currently ships with two local Provider Lab templates, not an editable template authoring system.
- recent-post browsing is currently fixed to ready posts in the UI, though the backend endpoint accepts a `status` query.
- Run listing is based on locally saved manifest files under the experiments directory.
- Final saved manifest URLs are local `/output/...` links in local fallback mode.
- Hyperframes rendering currently shells out to the CLI at runtime.

## Validation Completed

### `social-posting-v2`

- `npx vitest run tests/experiment-posts.test.ts`

### `render-engine`

- `npm run build`
- `npm test`

### Manual verification

- Hyperframes preview render completed end to end
- final Hyperframes render completed end to end
- final run saved MP4, poster, and manifest JSON under `/tmp/render-output/experiments/...`

## Recommended Next Steps

1. Decide whether the recent-post browser should expose non-`ready` filters in the UI or stay intentionally constrained.
2. Add inline manifest inspection and stronger debugging detail to the compare/review flow.
3. Decide whether Provider Lab templates should remain local registry entries or grow into editable records.
4. Only after the Hyperframes evaluation loop feels solid, consider a real Remotion implementation.

## Summary

Provider Lab has crossed from scaffold to a usable Hyperframes-first MVP harness.

It now supports:

- real V2 data
- recent-post browsing for ready experiment posts
- a real Hyperframes template registry and picker
- multiple Hyperframes templates
- real Hyperframes preview/final rendering
- saved experiment artifacts
- side-by-side saved-run comparison
- a clean provider boundary for future Remotion work

It does not yet support:

- editable provider template management
- full review tooling from the original plan
- Remotion rendering
- any production rollout path
