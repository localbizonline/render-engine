# Render Engine

Template Lab and render service for owned MP4 reel templates. `social-posting-v2` is the durable source of truth for approved templates, rollout, and production orchestration.

## Current State

- Repo path for the main app: `/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2`
- This repo owns reel authoring UX, preview rendering UX, JSON editing UX, the chat flow, the reference-video flow, and the V2 bridge flow.
- Template Lab is video-only:
  - prompt-only reel generation is live
  - reference-video reel generation is live
  - V2 load/edit/approve is live
  - reference-image authoring is removed
  - PNG template authoring is removed
- The designer can:
  - open an approved V2 reel via `v2ExportUrl`
  - use `v2Token` for short-lived scoped auth
  - fall back to a manually entered V2 admin secret if needed
  - auto-load the render-engine API key and V2 connection defaults from the server
  - auto-review generated reels against a reference video and iterate toward a closer slideshow match
  - visually edit the active frame with the Konva-powered canvas editor
  - upload overlay assets for decorative frame elements
  - send updates back with `Approve for V2`

## Relationship To `social-posting-v2`

- `social-posting-v2` stores approved owned templates in `render_templates`.
- `social-posting-v2` owns theme/category/post linking, rollout, soundtrack assignment, queue decisions, and production fallback behavior.
- `render-engine` is the reel Template Lab, preview workspace, and owned MP4 render backend.
- Do not treat local saves in this repo as the durable approval path for production templates.

## Current Integration Contract

- V2 export endpoint: `GET /api/admin/render-templates/:id/export`
- V2 import endpoint: `POST /api/admin/render-templates/import`
- V2 Template Lab session endpoint: `POST /api/admin/render-templates/:id/template-lab-session`
- Production render endpoint: `POST /api/render`
- The public designer routes are:
  - `/designer`
  - `/designer.html`
  - `/designer/reference-video`
  - `/designer/prompt`
  - `/designer/v2`
  - `/designer/json`
  - `/designer-bootstrap.js`
  - `/designer-v2-bridge.js`
  - `/designer-app.js`
  - `/designer-canvas-editor.js`
  - `/vendor/konva.min.js`

## Live Deployment

- URL: `https://render-engine-production.up.railway.app`
- Railway project: `keen-creativity`

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22 + Express 5 + TypeScript (ESM) |
| MP4 rendering | FFmpeg via fluent-ffmpeg |
| Internal frame compositor | `png-renderer.ts` + node-canvas |
| Storage | Cloudflare R2 |
| Prompt-based reel design | Anthropic SDK (`src/services/claude.ts`) |
| Reference-video analysis | Google Gemini Files API (`src/services/gemini-video.ts`) |
| Validation | Zod |
| Deployment | Railway |

## API Endpoints

All `/api/*` routes require `X-Api-Key`. Health and static designer routes are public.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Railway health check |
| POST | `/api/render` | Production owned-MP4 render endpoint |
| POST | `/api/preview` | Render a preview from inline template JSON |
| GET | `/api/templates` | List local templates |
| GET | `/api/templates/:id` | Get a local template definition |
| POST | `/api/templates` | Save a custom template to local in-memory registry |
| POST | `/api/design` | Generate a reel template JSON draft from a text prompt |
| POST | `/api/design/iterate` | Refine an existing reel template via text prompt |
| POST | `/api/design/video` | Generate a reel template from an uploaded reference video |
| POST | `/api/design/video/compare-iterate` | Compare generated reel output to the uploaded reference video and return the next revision |
| POST | `/api/design/save` | Save a designed template to the local in-memory registry |
| POST | `/api/designer/chat/message` | Continue a reel-authoring session in chat |

## Template System

Templates are declarative JSON for 9:16 slideshow-style reels.

```ts
{
  id: string;
  name: string;
  reference: string;
  outputFormat: "mp4";
  width: 1080;
  height: 1920;
  imageCount: number;
  categoryKeys: string[];
  fps?: number;
  transition?: { type, durationMs };
  frames: FrameDefinition[];
}
```

- Built-ins now live in `src/templates/builtin/` and are MP4-only.
- `autoSelectTemplate()` only returns MP4 built-ins.
- Existing PNG rows in V2 may still exist historically, but this repo rejects them at the bridge, preview, and authoring edges.

## Template Lab UI

Access locally at `http://localhost:3000/designer`.

### Supported flows

1. Upload a short MP4 or MOV reference clip.
2. Or enter a text prompt for a reel from scratch.
3. Or load an approved V2 reel for refinement.
4. Generate or iterate the reel draft.
5. Preview it locally with sample assets.
6. Optionally use `Visual Edit` to adjust the active frame directly.
7. Approve the reel back into V2.

### Important UI rules

- Reel Template Studio is video-only. There is no reference-image mode and no PNG/MP4 output selector.
- `Approve for V2` is the primary handoff path.
- The soundtrack pool is configured in V2 admin, not in Template Lab.
- Overlay uploads are allowed as decorative assets inside reel frames.

## Development

```bash
npm install
npm run dev
npm test
npx tsc --noEmit
npx playwright test tests/live-production.playwright.spec.js
npm run build
```

### Automated Tests

- `npm test` covers `tests/static-routes.test.mjs`, `tests/http-routes.test.ts`, and `tests/expand-photo-frames.test.ts`.
- The smoke coverage protects:
  - explicit public route wiring in `src/app.ts`
  - the extracted bridge, app, and canvas-editor bundles
  - readable reel-only designer routes
  - V2 load/approve flows
  - prompt-only generation
  - reference-video generation and compare-iterate
  - preview rendering and the production `/api/render` request envelope

