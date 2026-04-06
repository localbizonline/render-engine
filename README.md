# Render Engine

Template Lab and preview/design workspace for owned render templates. This repo is the authoring surface; `social-posting-v2` remains the durable source of truth for approved templates, linking, rollout, and queue execution.

## Live Designer

- Designer: [https://render-engine-production.up.railway.app/designer](https://render-engine-production.up.railway.app/designer)
- Reference video: [https://render-engine-production.up.railway.app/designer/reference-video](https://render-engine-production.up.railway.app/designer/reference-video)
- Reference image: [https://render-engine-production.up.railway.app/designer/reference-image](https://render-engine-production.up.railway.app/designer/reference-image)
- V2 improvement: [https://render-engine-production.up.railway.app/designer/v2](https://render-engine-production.up.railway.app/designer/v2)
- JSON workbench: [https://render-engine-production.up.railway.app/designer/json](https://render-engine-production.up.railway.app/designer/json)

## What It Does

- prompt-only reel generation for slideshow-style MP4 output
- reference-image generation and refinement
- reference-video generation using server-side Gemini video understanding
- iterative video auto-review:
  - compares generated preview video against the uploaded reference video
  - returns structured feedback and the next slideshow revision
- V2 import/export/session bridge for approved owned templates
- local preview rendering through `/api/preview`

## Important Limits

- MP4 output is slideshow-style, not motion-design recreation
- no audio extraction or reuse
- no caption timing or transcript sync
- no per-layer animation timeline
- reference-video matching is inspiration/structure based, not frame-perfect copying

## Docs

- project operating guide: [AGENTS.md](AGENTS.md)
- live environment and deploy notes: [AGENTS.md](AGENTS.md#live-deployment)
- Template Lab and V2 relationship: [AGENTS.md](AGENTS.md#relationship-to-social-posting-v2)

## Local Dev

```bash
npm install
npm run dev
npm test
npx tsc --noEmit
npm run build
```

See [AGENTS.md](AGENTS.md) for the fuller environment, API, and deployment guide.
