# Render Engine

Template Lab and preview/design workspace for owned render templates. `social-posting-v2` is the durable source of truth for approved templates, rollout, and production orchestration.

## Current State

- Repo path for the main app: `/Users/jeremymartin/Documents/Cursor/In Production/social-posting-v2`
- This repo is used for authoring UX, preview rendering UX, JSON editing UX, and the V2 bridge flow.
- The current Template Lab bridge is PNG-only.
- Airtable integration has been removed from the active runtime in this repo.
- The designer can:
  - open an approved V2 template via `v2ExportUrl`
  - use `v2Token` for short-lived scoped auth
  - fall back to a manually entered V2 admin secret if needed
  - send updates back with `Approve for V2`

### Production MP4 render endpoint (added 2026-04-17)

- `POST /api/render` is the production owned-MP4 render endpoint called by
  `social-posting-v2`. See `VIDEO_ONLY_REFACTOR_PLAN.md` for the scope and
  keep/refactor/remove inventory that drives the video-only cutover.
- Contract: request carries `templateJson`, `variables`, `assets`, and
  `renderOptions.outputVideoKey` + `renderOptions.outputPosterKey`. Renderer
  uploads the MP4 and a poster JPG directly to R2 at those exact keys and
  returns `{ success, r2Key, posterR2Key, meta }`. No base64 MP4 payload
  round-trips through HTTP on this path.
- v2 owns R2 key conventions. `R2_BUCKET_NAME` in this repo must point at
  the v2 media bucket (`social-posting-media`) — not the default
  `render-engine-output` bucket.
- Auth: `x-api-key` header, same shared secret that already guards
  `/api/*` routes.
- Authoring surface (`/api/design*`, `/api/designer*`, Template Lab static
  assets) is scheduled for removal in Phase 5 of the cutover plan, after
  production MP4 is live on at least one theme.

## Relationship To `social-posting-v2`

- `social-posting-v2` is the durable source of truth for approved owned templates, theme/category linking, rollout, and production render decisions.
- `render-engine` is the Template Lab and preview/design workspace.
- Work here when the task is about:
  - `public/designer.html`
  - `public/designer-v2-bridge.js`
  - preview rendering UX
  - authoring flow
  - V2 bridge behavior
- Do not treat local saves in this repo as the durable approval path for production templates.

## Current Integration Contract

- V2 export endpoint: `GET /api/admin/render-templates/:id/export`
- V2 import endpoint: `POST /api/admin/render-templates/import`
- V2 Template Lab session endpoint: `POST /api/admin/render-templates/:id/template-lab-session`
- The designer accepts:
  - `v2ExportUrl`
  - `v2Token`
- The designer serves:
  - `/designer`
  - `/designer.html`
  - `/designer-v2-bridge.js`
  - `/designer-app.js`

## Live Deployment

- URL: `https://render-engine-production.up.railway.app`
- Railway project: `keen-creativity` (`3453ac5d-bc4c-4c31-8c11-6a99f5edb2b4`)
- API Key header: `X-Api-Key: 24c9362a2258ae1a59ac104f7d712e6028ceabd74708352c72b101638ce6f60e`
- R2 public URL: `https://pub-6279ebe32d304c3b910ad4140492aca3.r2.dev`

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22 + Express 5 + TypeScript (ESM) |
| PNG rendering | node-canvas (Cairo bindings) + sharp (WebP conversion) |
| MP4 rendering | FFmpeg via fluent-ffmpeg |
| Storage | Cloudflare R2 (S3-compatible) |
| Template design (text) | Anthropic SDK (`src/services/claude.ts`) |
| Template design (vision) | Claude CLI |
| Template source | Local built-in templates + V2 export/import bridge |
| Validation | Zod |
| Deployment | Railway (Docker) |

## Project Structure

```text
render-engine/
├── src/
│   ├── app.ts                       # Express app factory for runtime + tests
│   ├── index.ts                     # Runtime bootstrap / listen entrypoint
│   ├── config.ts                    # Env var loader
│   ├── types.ts                     # Shared TypeScript interfaces
│   ├── test-render.ts               # Local built-in render check
│   ├── routes/
│   │   ├── render.ts                # Legacy Airtable-style render endpoints now return 410
│   │   ├── templates.ts             # Local template endpoints + removed Airtable endpoint stubs
│   │   ├── preview.ts               # POST /api/preview
│   │   └── design.ts                # POST /api/design*
│   ├── engine/
│   │   ├── png-renderer.ts
│   │   ├── mp4-renderer.ts
│   │   ├── layout-engine.ts
│   │   ├── asset-loader.ts
│   │   └── font-manager.ts
│   ├── services/
│   │   ├── claude.ts
│   │   └── r2-storage.ts
│   ├── templates/
│   │   ├── registry.ts              # Local built-ins + in-memory custom templates
│   │   ├── schema.ts
│   │   └── builtin/
│   └── utils/
├── public/
│   ├── designer.html                # Template Lab UI
│   ├── designer-v2-bridge.js        # Extracted V2 bridge helper
│   ├── designer-app.js              # Extracted non-V2 designer app logic
│   └── designer-assets/             # Sample assets for previews
├── tests/
│   └── static-routes.test.mjs       # Node-core smoke tests for Template Lab route wiring and assets
├── fonts/
├── Dockerfile
├── railway.json
├── package.json
└── .env.example
```

## API Endpoints

All `/api/*` routes require `X-Api-Key`. Health and static designer routes are public.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Railway health check |
| POST | `/api/preview` | Render a preview from inline template JSON |
| GET | `/api/templates` | List local templates |
| GET | `/api/templates/:id` | Get a local template definition |
| POST | `/api/templates` | Save a custom template to local in-memory registry |
| GET | `/api/templates/managed` | Returns `410` (old Airtable path removed) |
| POST | `/api/templates/sync` | Returns `410` (old Airtable path removed) |
| POST | `/api/templates/save-to-airtable` | Returns `410` (old Airtable path removed) |
| PUT | `/api/templates/:recordId/activate` | Returns `410` (old Airtable path removed) |
| PUT | `/api/templates/:recordId/rotation` | Returns `410` (old Airtable path removed) |
| POST | `/api/design` | Generate template JSON from text prompt |
| POST | `/api/design/iterate` | Refine an existing template via text prompt |
| POST | `/api/design/vision` | Generate template from reference image |
| POST | `/api/design/vision/iterate` | Iterate template from reference + preview |
| POST | `/api/design/vision/compare` | Rate similarity between reference + preview |
| POST | `/api/design/vision/compare-iterate` | Combined compare + iterate loop |
| POST | `/api/design/save` | Save designed template to local in-memory registry |
| POST | `/api/render/sync` | Returns `410` (old Airtable path removed) |
| POST | `/api/render/test` | Returns `410` (old Airtable path removed) |
| GET | `/designer` | Template Lab UI |
| GET | `/designer.html` | Template Lab UI direct file route |
| GET | `/designer-v2-bridge.js` | Extracted V2 bridge helper |

## Template System

Templates are declarative JSON for a 1080x1080 canvas.

```ts
{
  id: string;
  name: string;
  reference: string;
  outputFormat: "png" | "mp4";
  width: 1080;
  height: 1080;
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

Variable substitution supports:

- text: `{{title}}`, `{{subtitle}}`, `{{body}}`, `{{phone}}`, `{{company_name}}`, `{{service_areas}}`, `{{website}}`
- colors: `{{primary_colour}}`, `{{secondary_colour}}`

## Local Registry

- Built-in templates are loaded from `src/templates/builtin/`.
- Custom templates saved through `/api/design/save` or `POST /api/templates` are kept in local in-memory registry only.
- `autoSelectTemplate()` now uses local built-ins and a simple hash-based fallback rather than Airtable rotation state.

## Template Designer UI

Access locally at `http://localhost:3000/designer`.

### What It Does

1. Upload a reference image.
2. Optionally add a text prompt.
3. Generate or iterate template JSON with Claude API / Claude CLI.
4. Render a preview using local sample assets from `public/designer-assets/`.
5. Load approved templates from V2.
6. Approve updated templates back into V2.

### Bridge Notes

- V2 bridge helper lives in `public/designer-v2-bridge.js`.
- Main UI markup lives in `public/designer.html`.
- The non-V2 designer app logic lives in `public/designer-app.js`.
- The designer stores:
  - render-engine API key
  - V2 base URL
  - fallback V2 admin secret
- Scoped V2 session links remain the preferred path.
- Source-level smoke tests protect the extracted Template Lab bridge/app behavior and explicit route wiring.
- HTTP-level smoke tests now hit the real Express app for `/designer`, `/designer.html`, `/designer-v2-bridge.js`, `/designer-app.js`, `/health`, and the legacy `410 Gone` endpoints.

### Current UI Behavior

- `Approve for V2` is the primary handoff path.
- Legacy Airtable save has been removed from the UI.
- The V2 handoff panel no longer shows the unused Categories control.
- The V2 handoff image count is now a generic numeric PNG image count, not an MP4 selector.
- The preview pane now shows explicit V2 load status, including the “template loaded but preview needs API key” state.
- `Approve for V2` now rejects missing template name, missing template id, and invalid image counts before posting to V2.
- The V2 handoff panel now shows persistent load/approval state, including the linked V2 template id and updated export URL after approval.
- The V2 handoff panel also includes one-click copy actions for the linked V2 template id and export URL.
- Explicit server routes for `/designer`, `/designer.html`, and `/designer-v2-bridge.js` were added after a Railway static-route regression during deployment.
- Explicit server routes protect `/designer`, `/designer.html`, `/designer-v2-bridge.js`, and `/designer-app.js`.

## Development

### Local Setup

```bash
brew install cairo pango libpng jpeg giflib librsvg pkg-config
npm install
npm run dev
npm test
npm run test:render
npx tsc --noEmit
npm run build
```

### Automated Tests

- `npm test` runs the Node test runner against `tests/static-routes.test.mjs`.
- Current automated coverage is intentionally narrow and protects:
  - explicit public route wiring in `src/app.ts`
  - shared bootstrap usage in `src/index.ts`
  - `public/designer.html`
  - `public/designer-v2-bridge.js`
  - `public/designer-app.js`
- The same test file also runs browser-like VM smoke checks for the V2 bridge:
  - scoped session-link bootstrap from `v2ExportUrl` + `v2Token`
  - V2 export loading and normalization
  - PNG approval payload creation and export-context refresh
  - connected-input syncing/persistence and `Open V2 Admin` URL behavior
- The same test file also runs browser-like VM smoke checks for `public/designer-app.js`:
  - auto-loading an approved V2 template from a scoped session link
  - rendering a preview after V2 load when a render-engine API key is present
  - loading V2 template metadata without preview when the render-engine API key is missing
  - refusing to auto-load when V2 auth is missing
  - surfacing the updated V2 template id/export URL after approval
- `src/app.ts` exists so tests can import the Express app without auto-starting the server.

### Environment Variables

Copy `.env.example` to `.env` and fill in:

- `RENDER_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`
- `ANTHROPIC_API_KEY`

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
curl -I https://render-engine-production.up.railway.app/designer-v2-bridge.js
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
