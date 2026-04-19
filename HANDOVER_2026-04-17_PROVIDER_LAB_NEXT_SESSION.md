# Provider Lab Handover Prompt

Use this prompt to continue the Provider Lab work in a new Codex session.

---

We’re working across two repos:

- [`/Users/jeremymartin/Documents/Cursor/render-engine`](/Users/jeremymartin/Documents/Cursor/render-engine)
- [`/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2`](/Users/jeremymartin/Documents/Cursor/In%20Production/social-posting-v2)

Goal:
Continue the MVP “Provider Lab” build in `render-engine` so we can evaluate alternative reel-template providers using real posts from `social-posting-v2`, without integrating anything into production rotation yet.

Source-of-truth docs:

- [`/Users/jeremymartin/Documents/Cursor/render-engine/PLAN_2026-04-17_PROVIDER_EXPERIMENT_MVP.md`](/Users/jeremymartin/Documents/Cursor/render-engine/PLAN_2026-04-17_PROVIDER_EXPERIMENT_MVP.md)
- [`/Users/jeremymartin/Documents/Cursor/render-engine/FEATURE_2026-04-17_PROVIDER_LAB_STATUS.md`](/Users/jeremymartin/Documents/Cursor/render-engine/FEATURE_2026-04-17_PROVIDER_LAB_STATUS.md)

What has already been implemented:

### `social-posting-v2`

- Read-only experiment snapshot endpoint:
  - [`GET /api/admin/experiment-posts/:id`](</Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2/src/routes/api/admin/posts.ts:319>)
- Snapshot test:
  - [`/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2/tests/experiment-posts.test.ts`](/Users/jeremymartin/Documents/Cursor/In%20Production/social-posting-v2/tests/experiment-posts.test.ts:1)

### `render-engine`

- Provider Lab shell route:
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/src/app.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/app.ts:18)
- V2 snapshot proxy:
  - [`GET /api/designer/v2/post?id=<postId>`](/Users/jeremymartin/Documents/Cursor/render-engine/src/routes/designer.ts:180)
- Provider Lab API routes:
  - `GET /api/designer/provider-lab/providers`
  - `GET /api/designer/provider-lab/runs`
  - `POST /api/designer/provider-lab/preview`
  - `POST /api/designer/provider-lab/render`
- Provider abstraction:
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/types.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/types.ts:1)
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/index.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/index.ts:1)
- Hyperframes provider:
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/hyperframes.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/hyperframes.ts:1)
- Provider Lab persistence:
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/src/services/provider-lab.ts`](/Users/jeremymartin/Documents/Cursor/render-engine/src/services/provider-lab.ts:1)
- Provider Lab UI:
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/public/designer.html`](/Users/jeremymartin/Documents/Cursor/render-engine/public/designer.html:2196)
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/public/designer-app.js`](/Users/jeremymartin/Documents/Cursor/render-engine/public/designer-app.js:2032)
  - [`/Users/jeremymartin/Documents/Cursor/render-engine/public/designer-v2-bridge.js`](/Users/jeremymartin/Documents/Cursor/render-engine/public/designer-v2-bridge.js:286)

What currently works:

- Load a real V2 post snapshot by post ID
- Choose provider in Provider Lab
- Render a Hyperframes preview
- Render and save a final Hyperframes run
- Save MP4 + poster PNG + `manifest.json`
- List recent saved runs
- Remotion is scaffolded only, not implemented

What is still intentionally not done:

- production rollout
- rotation logic
- theme/category assignment
- writing provider templates back into V2 production records
- scheduling/publishing work

Highest-value next steps:

1. Add recent-post browsing from V2 instead of only post-ID paste.
2. Add a real Hyperframes template registry and template picker.
3. Add multiple Hyperframes templates so the provider/template abstraction is exercised properly.
4. Improve the Provider Lab review UI for comparing saved runs.
5. Only after that, consider a Remotion implementation.

Please start by:

1. auditing the current Provider Lab implementation against the plan and status docs
2. proposing the smallest next slice to implement
3. implementing that slice end to end
4. updating the docs if the completed scope changes
5. running relevant tests

Important constraints:

- Do not work on production rollout, rotation, theme assignment, or production template linking.
- Reuse the existing V2 bridge/auth pattern in `render-engine`.
- Keep `social-posting-v2` read-only for experiment snapshot access unless a new list endpoint is needed.
- Preserve the provider abstraction so Remotion can be added later.
- Do not revert unrelated local changes in either repo.

Useful validation commands:

### `render-engine`

- `npm run build`
- `npm test`

### `social-posting-v2`

- `npx vitest run tests/experiment-posts.test.ts`

When you finish the next slice, update:

- [`/Users/jeremymartin/Documents/Cursor/render-engine/FEATURE_2026-04-17_PROVIDER_LAB_STATUS.md`](/Users/jeremymartin/Documents/Cursor/render-engine/FEATURE_2026-04-17_PROVIDER_LAB_STATUS.md)
- [`/Users/jeremymartin/Documents/Cursor/render-engine/PLAN_2026-04-17_PROVIDER_EXPERIMENT_MVP.md`](/Users/jeremymartin/Documents/Cursor/render-engine/PLAN_2026-04-17_PROVIDER_EXPERIMENT_MVP.md)

---

Suggested immediate next slice:

Implement recent-post browsing for Provider Lab.

That likely means:

- add `GET /api/admin/experiment-posts?limit=...` in `social-posting-v2`
- add a matching proxy route in `render-engine`
- add a recent-post list/picker in Provider Lab UI
- keep the existing post-ID load path intact
