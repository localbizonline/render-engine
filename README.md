# Render Engine

Video-only Template Lab and render service for approved owned reel templates. `social-posting-v2` remains the durable source of truth for approved templates, linking, rollout, and queue execution.

## Live Designer

- Designer: [https://render-engine-production.up.railway.app/designer](https://render-engine-production.up.railway.app/designer)
- Reference video: [https://render-engine-production.up.railway.app/designer/reference-video](https://render-engine-production.up.railway.app/designer/reference-video)
- Prompt: [https://render-engine-production.up.railway.app/designer/prompt](https://render-engine-production.up.railway.app/designer/prompt)
- V2 improvement: [https://render-engine-production.up.railway.app/designer/v2](https://render-engine-production.up.railway.app/designer/v2)
- JSON workbench: [https://render-engine-production.up.railway.app/designer/json](https://render-engine-production.up.railway.app/designer/json)

## What It Does

- prompt-only reel generation for slideshow-style MP4 output
- reference-video reel generation using server-side Gemini video understanding
- iterative video review against the uploaded reference clip
- local preview rendering through `/api/preview`
- V2 export/import/session bridge for approved owned reel templates
- visual frame editing for generated or loaded reel templates
- overlay asset upload for badges, borders, and decorative frame elements

## Product Boundaries

- Template Lab is reel-only. Static-image authoring, reference-image mode, and vision endpoints are removed.
- All templates must output `mp4`.
- `png-renderer.ts` still exists as internal frame-compositing infrastructure inside the MP4 pipeline. It is no longer a user-facing product surface.

## Important Limits

- MP4 output is slideshow-style, not motion-design recreation
- no audio extraction or reuse from the reference video
- no caption timing or transcript sync
- no per-layer animation timeline
- reference-video matching is inspiration and structure based, not frame-perfect copying

## Local Dev

```bash
npm install
npm run dev
npm test
npx tsc --noEmit
npx playwright test tests/live-production.playwright.spec.js
npm run build
```

## Verification

- `npm test` covers Node, VM, and HTTP smoke coverage for the designer shell, bridge, and reel-only authoring flows.
- `npx tsc --noEmit` verifies the TypeScript surface.
- `npx playwright test tests/live-production.playwright.spec.js` checks the live Railway designer shell and visual editor assets.
- `npm run smoke:r2` is the production render smoke when credentials are configured.

## Docs

- operating guide: [AGENTS.md](AGENTS.md)
- repo memory: [CLAUDE.md](CLAUDE.md)

