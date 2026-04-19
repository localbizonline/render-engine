# Render Engine

Reel Template Studio and preview/design workspace for owned MP4 render templates. `social-posting-v2` is the durable source of truth for approved templates, rollout, soundtrack assignment, and production orchestration.

## Current State

- Repo path for the main app: `/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2`
- This repo handles reel authoring UX, preview rendering UX, JSON editing UX, reference-video analysis, and the V2 bridge flow.
- This repo also exposes the upstream Hyperframes composition render path used by V2 admin/runtime.
- User-facing output is MP4 only. Static-image authoring and reference-image workflows are retired.
- Airtable integration has been removed from the active runtime in this repo.
- The studio can:
  - open an approved V2 template via `v2ExportUrl`
  - use `v2Token` for short-lived scoped auth
  - fall back to a manually entered V2 admin secret if needed
  - auto-load the render-engine API key and V2 connection defaults from the server
  - generate slideshow-style MP4 reels from prompt-only or reference-video inputs
  - auto-review generated reels against a reference video and iterate toward a closer slideshow match
  - visually edit the active frame with a Konva-powered canvas editor
  - drag, resize, nudge, duplicate, delete, reorder, hide, and lock layers
  - double-click text layers for inline editing
  - upload decorative overlay assets for borders, flourishes, and frame accents
  - snap layers to canvas edges, centers, and nearby layer guides
  - undo and redo visual edits before re-rendering the server preview
  - send updates back with `Approve for V2`

## Relationship To `social-posting-v2`

- `social-posting-v2` is the durable source of truth for approved owned templates, theme/category linking, soundtrack assignment, rollout, and production render decisions.
- `render-engine` is the reel authoring studio and preview/design workspace.
- `render-engine` is also the upstream final-render service for Hyperframes compositions authored and selected in V2.
- `render-engine` is also the upstream preview-render service for Hyperframes Studio parity in V2.
- Work here when the task is about:
  - `public/designer.html`
  - `public/designer-v2-bridge.js`
  - `public/designer-app.js`
  - `public/designer-canvas-editor.js`
  - preview rendering UX
  - authoring flow
  - V2 bridge behavior
- Do not treat local saves in this repo as the durable approval path for production templates.

## Current Integration Contract

- V2 export endpoint: `GET /api/admin/render-templates/:id/export`
- V2 import endpoint: `POST /api/admin/render-templates/import`
- V2 Template Lab session endpoint: `POST /api/admin/render-templates/:id/template-lab-session`
- The studio accepts:
  - `v2ExportUrl`
  - `v2Token`
- The studio serves:
  - `/designer`
  - `/designer.html`
  - `/designer/prompt`
  - `/designer/reference-video`
  - `/designer/v2`
  - `/designer/json`
  - `/designer-v2-bridge.js`
  - `/designer-app.js`
  - `/designer-canvas-editor.js`
  - `/vendor/konva.min.js`

## Live Deployment

- URL: `https://render-engine-production.up.railway.app`
- Railway project: `keen-creativity` (`3453ac5d-bc4c-4c31-8c11-6a99f5edb2b4`)
- API Key header: `X-Api-Key: 24c9362a2258ae1a59ac104f7d712e6028ceabd74708352c72b101638ce6f60e`
- R2 public URL: `https://pub-6279ebe32d304c3b910ad4140492aca3.r2.dev`

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22 + Express 5 + TypeScript (ESM) |
| Frame compositing | node-canvas (Cairo bindings) + sharp |
| MP4 rendering | FFmpeg via fluent-ffmpeg |
| Storage | Cloudflare R2 (S3-compatible) |
| Template design (text) | Anthropic SDK (`src/services/claude.ts`) |
| Reference-video analysis | Google Gemini Files API + structured JSON output (`src/services/gemini-video.ts`) |
| Template source | Local built-in templates + V2 export/import bridge |
| Validation | Zod |
| Deployment | Railway (Docker) |

## Project Structure

```text
render-engine/
├── src/
│   ├── app.ts
│   ├── index.ts
│   ├── config.ts
│   ├── types.ts
│   ├── test-render.ts
│   ├── routes/
│   │   ├── render.ts
│   │   ├── templates.ts
│   │   ├── preview.ts
│   │   └── design.ts
│   ├── engine/
│   │   ├── png-renderer.ts          # internal frame compositor used by the MP4 path
│   │   ├── mp4-renderer.ts
│   │   ├── layout-engine.ts
│   │   ├── asset-loader.ts
│   │   └── font-manager.ts
│   ├── services/
│   │   ├── claude.ts
│   │   ├── designer-chat.ts
│   │   ├── gemini-video.ts
│   │   └── r2-storage.ts
│   ├── templates/
│   │   ├── registry.ts
│   │   ├── schema.ts
│   │   └── builtin/
│   └── utils/
├── public/
│   ├── designer.html
│   ├── designer-v2-bridge.js
│   ├── designer-app.js
│   ├── designer-canvas-editor.js
│   └── designer-assets/
├── tests/
│   ├── static-routes.test.mjs
│   ├── http-routes.test.ts
│   └── live-production.playwright.spec.js
├── fonts/
├── Dockerfile
├── railway.json
├── package.json
└── .env.example
```

## API Endpoints

All `/api/*` routes require `X-Api-Key`. Health and static studio routes are public.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Railway health check |
| POST | `/api/preview` | Render a preview from inline MP4 template JSON |
| GET | `/api/templates` | List local templates |
| GET | `/api/templates/:id` | Get a local template definition |
| POST | `/api/templates` | Save a custom template to local in-memory registry |
| POST | `/api/render/hyperframes/preview` | Render a Hyperframes HTML/CSS/JS composition in preview mode and write caller-owned preview artifact keys |
| POST | `/api/render/hyperframes` | Render a Hyperframes HTML/CSS/JS composition to MP4 plus poster and write caller-owned artifact keys |
| GET | `/api/templates/managed` | Returns `410` (old Airtable path removed) |
| POST | `/api/templates/sync` | Returns `410` (old Airtable path removed) |
| POST | `/api/templates/save-to-airtable` | Returns `410` (old Airtable path removed) |
| PUT | `/api/templates/:recordId/activate` | Returns `410` (old Airtable path removed) |
| PUT | `/api/templates/:recordId/rotation` | Returns `410` (old Airtable path removed) |
| POST | `/api/design` | Generate an MP4 reel template from text prompt |
| POST | `/api/design/iterate` | Refine an existing MP4 reel template via text prompt |
| POST | `/api/design/video` | Generate an MP4 reel template from an uploaded reference video |
| POST | `/api/design/video/compare-iterate` | Compare generated MP4 preview vs uploaded reference video and return the next revision |
| POST | `/api/design/save` | Save designed template to local in-memory registry |
| POST | `/api/render/sync` | Returns `410` (old Airtable path removed) |
| POST | `/api/render/test` | Returns `410` (old Airtable path removed) |
| GET | `/designer` | Reel Template Studio |
| GET | `/designer.html` | Reel Template Studio direct file route |
| GET | `/designer/prompt` | Readable route for prompt-led authoring |
| GET | `/designer/reference-video` | Readable route for reference-video authoring |
| GET | `/designer/v2` | Readable route for V2 improvement sessions |
| GET | `/designer/json` | Readable route for JSON workbench sessions |
| GET | `/designer-v2-bridge.js` | Extracted V2 bridge helper |
| GET | `/designer-canvas-editor.js` | Konva-powered visual frame editor bundle |
| GET | `/vendor/konva.min.js` | Served Konva runtime for the visual editor |

## Template System

Templates are declarative JSON for slideshow-style reels.

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

Layer types:

- `image`
- `text`
- `rect`
- `logo`
- `cta_image`
- `accent_bar`
- `asset_image`

Layer objects may also carry editor-oriented metadata such as:

- optional stable `id`
- optional `name`
- optional `locked`
- optional `visible`
- optional `borderRadius`
- optional `opacity`

Variable substitution supports:

- text: `{{title}}`, `{{subtitle}}`, `{{body}}`, `{{phone}}`, `{{company_name}}`, `{{service_areas}}`, `{{website}}`
- colors: `{{primary_colour}}`, `{{secondary_colour}}`

## Local Registry

- Built-in templates are loaded from `src/templates/builtin/`.
- Custom templates saved through `/api/design/save` or `POST /api/templates` are kept in local in-memory registry only.
- `autoSelectTemplate()` now uses local built-ins and a simple hash-based fallback rather than Airtable rotation state.

## Reel Template Studio

Access locally at `http://localhost:3000/designer`.

### What It Does

1. Upload a short reference video when you want slideshow-style matching from video.
2. Optionally add a text prompt.
3. Generate or iterate MP4 template JSON with Claude or Gemini-backed services.
4. Render a preview using local sample assets from `public/designer-assets/`.
5. Optionally switch into `Visual Edit` to adjust the active frame directly.
6. Upload decorative overlay assets when you need borders, flourishes, or frame accents.
7. Load approved templates from V2.
8. Approve updated templates back into V2.

### Bridge Notes

- V2 bridge helper lives in `public/designer-v2-bridge.js`.
- Main UI markup lives in `public/designer.html`.
- The non-V2 designer app logic lives in `public/designer-app.js`.
- The Konva-powered visual editor lives in `public/designer-canvas-editor.js`.
- The studio stores:
  - render-engine API key
  - V2 base URL
  - fallback V2 admin secret
- Scoped V2 session links remain the preferred path.
- Source-level smoke tests protect the extracted studio bridge/app behavior and explicit route wiring.
- HTTP-level smoke tests hit the real Express app for `/designer`, `/designer.html`, `/designer-v2-bridge.js`, `/designer-canvas-editor.js`, `/vendor/konva.min.js`, `/designer-app.js`, `/health`, and the legacy `410 Gone` endpoints.

### Current UI Behavior

- `Approve for V2` is the primary handoff path.
- Legacy Airtable save has been removed from the UI.
- The right rail includes a `Visual Edit` canvas editor for the active frame.
- The visual editor supports:
  - drag/resize handles
  - snapping guides
  - arrow-key nudging with larger `Shift` steps
  - duplicate via `Cmd/Ctrl + D`
  - delete selected layer
  - undo/redo controls
  - inline double-click text editing
  - decorative overlay upload for frame accents
- The V2 handoff panel no longer shows the unused Categories control.
- The V2 handoff panel uses a single reel photo-count field.
- The preview pane shows explicit V2 load status, including the “template loaded but preview needs API key” state.
- `Approve for V2` rejects missing template name, missing template id, and invalid photo counts before posting to V2.
- The V2 handoff panel shows persistent load/approval state, including the linked V2 template id and updated export URL after approval.
- The V2 handoff panel includes one-click copy actions for the linked V2 template id and export URL.
- Explicit server routes protect `/designer`, `/designer.html`, `/designer/prompt`, `/designer/reference-video`, `/designer/v2`, `/designer/json`, `/designer-v2-bridge.js`, `/designer-canvas-editor.js`, `/vendor/konva.min.js`, and `/designer-app.js`.
- The studio supports readable URL modes plus prompt-prefill query strings for direct entry into the right authoring path.
- The `Reference Video` workflow supports:
  - multipart MP4/MOV upload
  - server-side Gemini analysis
  - local slideshow template synthesis
  - preview through the existing `/api/preview` flow
- Reference-video drafts support auto-review and iterative refinement against the uploaded reference video.
- The left rail includes a `Video Review` card with score, confidence, structure tags, and notes from the latest analysis/review pass.
- The normal live designer flow no longer requires manual entry of the render-engine API key or V2 base URL when server defaults are configured.
- Current MP4 output remains slideshow-style and inspiration-based:
  - no frame-perfect recreation
  - no audio extraction
  - no caption synchronization
  - no per-layer motion timeline

## Development

### Local Setup

```bash
brew install cairo pango libpng jpeg giflib librsvg pkg-config
npm install
npm run dev
npm test
npm run test:render
npx tsc --noEmit
npx playwright test tests/live-production.playwright.spec.js
npm run build
```

### Automated Tests

- `npm test` covers both `tests/static-routes.test.mjs` and `tests/http-routes.test.ts`.
- Current automated coverage protects:
  - explicit public route wiring in `src/app.ts`
  - shared bootstrap usage in `src/index.ts`
  - `public/designer.html`
  - `public/designer-v2-bridge.js`
  - `public/designer-canvas-editor.js`
  - `public/designer-app.js`
- The same test file also runs browser-like VM smoke checks for the V2 bridge:
  - scoped session-link bootstrap from `v2ExportUrl` + `v2Token`
  - V2 export loading and normalization
  - MP4 approval payload creation and export-context refresh
  - connected-input syncing/persistence and `Open V2 Admin` URL behavior
- The same test file also runs browser-like VM smoke checks for `public/designer-app.js`:
  - auto-loading an approved V2 template from a scoped session link
  - rendering a preview after V2 load when a render-engine API key is present
  - loading V2 template metadata without preview when the render-engine API key is missing
  - refusing to auto-load when V2 auth is missing
  - surfacing the updated V2 template id/export URL after approval
  - reference-video generation
  - reference-video compare-iterate loop
  - readable URL mode selection and prompt prefill
  - the live video-analysis summary card state
- The browser-module smoke coverage also checks the visual editor shell and shipped canvas bundle for:
  - Konva route wiring
  - visual-edit controls and upload affordances
  - visual-editor factory export
  - inline text-edit support markers
  - snapping/upload strings that confirm the live build contains this session's editor features
- `tests/http-routes.test.ts` verifies the real app serves:
  - `/designer-canvas-editor.js`
  - `/vendor/konva.min.js`
  - the updated designer HTML markers for visual edit, overlay upload, and undo controls
- `tests/live-production.playwright.spec.js` is a real browser smoke test against `https://render-engine-production.up.railway.app/designer`.
  - It verifies the production page loads in a browser, the visual-editor controls are present, and the shipped canvas/Konva assets return `200`.
  - It saves a live screenshot to `/tmp/render-engine-live-designer-playwright.png`.
- `src/app.ts` exists so tests can import the Express app without auto-starting the server.

Recommended test commands:

```bash
npm test
npx tsc --noEmit
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

- `RENDER_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_VIDEO_MODEL`

### Deploying to Railway

Use a fresh `/tmp` copy. Verify the copy contains `package.json`, `src/`, `public/`, `Dockerfile`, and `railway.json` before upload.

```bash
rm -rf /tmp/render-engine-deploy
mkdir -p /tmp/render-engine-deploy
rsync -a \
  --exclude '.env' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.claude' \
  /Users/jeremymartin/Documents/Cursor/render-engine/ \
  /tmp/render-engine-deploy/

cd /tmp/render-engine-deploy

railway link --project 3453ac5d-bc4c-4c31-8c11-6a99f5edb2b4 --service render-engine --environment production
railway up -d --service render-engine
```

After deploy, verify:

```bash
curl https://render-engine-production.up.railway.app/health
curl -I https://render-engine-production.up.railway.app/designer
curl -I https://render-engine-production.up.railway.app/designer.html
curl -I https://render-engine-production.up.railway.app/designer/reference-video
curl -I https://render-engine-production.up.railway.app/designer/prompt
curl -I https://render-engine-production.up.railway.app/designer-v2-bridge.js
curl -I https://render-engine-production.up.railway.app/designer-canvas-editor.js
curl -I https://render-engine-production.up.railway.app/vendor/konva.min.js
npx playwright test tests/live-production.playwright.spec.js
```

## R2 Storage

- Bucket: `social-post-images`
- Endpoint: `https://9cae6404b337b12ce3820fd7b9b81d43.r2.cloudflarestorage.com`
- Public URL prefix: `https://pub-6279ebe32d304c3b910ad4140492aca3.r2.dev`
- If R2 env vars are not set, the app falls back to local `/tmp/render-output` with Express static serving.

## Historical Notes

- Older Airtable-specific material in prior docs or session notes is historical only.
- The current runtime no longer contains Airtable service code or Airtable automation scripts.
- If a future task needs production render orchestration, durable template rollout, or approval-state behavior, make that change in `social-posting-v2`, not in this repo.
