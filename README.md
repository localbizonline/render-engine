# Render Engine

Reel Template Studio and render service for approved owned reel templates. `social-posting-v2` remains the durable source of truth for approved templates, linking, rollout, soundtrack assignment, and queue execution.

The same deployment now also exposes the upstream Hyperframes composition preview and final-render paths used by V2.

## Live Studio

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
- Hyperframes preview rendering from HTML/CSS/JS composition source through `/api/render/hyperframes/preview`
- final Hyperframes MP4 rendering from HTML/CSS/JS composition source through `/api/render/hyperframes`

## Product Boundaries

- Reel Template Studio is reel-only. Static-image authoring, reference-image mode, and vision endpoints are removed.
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

- `npm test` covers Node, VM, and HTTP smoke coverage for the studio shell, bridge, and reel-only authoring flows.
- `npx tsc --noEmit` verifies the TypeScript surface.
- `npx playwright test tests/live-production.playwright.spec.js` checks the live Railway studio shell and visual editor assets.
- `npm run smoke:r2` is the production render smoke when credentials are configured.

## Render Service Notes

- `POST /api/render` remains the owned JSON-template render path.
- `POST /api/render/hyperframes/preview` is the composition-native preview path used by V2 Hyperframes Studio preview parity.
- `POST /api/render/hyperframes` is the composition-native final MP4 path used by V2 Hyperframes Studio and queue-time Hyperframes renders.

## Docs

- operating guide: [AGENTS.md](AGENTS.md)
- repo memory: [CLAUDE.md](CLAUDE.md)
