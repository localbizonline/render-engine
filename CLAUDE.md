# Render Engine

Self-hosted image/video rendering service that replaces Creatomate (paid SaaS). Generates 1080x1080 PNG social media posts and MP4 slideshow reels from declarative JSON template definitions, pulling dynamic content from Airtable and uploading results to Cloudflare R2.

## Live Deployment

- **URL:** https://render-engine-production.up.railway.app
- **Railway project:** keen-creativity (ID: 3453ac5d-bc4c-4c31-8c11-6a99f5edb2b4)
- **API Key header:** `X-Api-Key: 24c9362a2258ae1a59ac104f7d712e6028ceabd74708352c72b101638ce6f60e`
- **R2 public URL:** https://pub-6279ebe32d304c3b910ad4140492aca3.r2.dev

## Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22 + Express 5 + TypeScript (ESM) |
| PNG rendering | node-canvas (Cairo bindings) + sharp (WebP conversion) |
| MP4 rendering | FFmpeg via fluent-ffmpeg |
| Storage | Cloudflare R2 (S3-compatible) |
| Template design | Claude API (Sonnet 4.5) |
| Data source | Airtable REST API |
| Validation | Zod |
| Deployment | Railway (Docker) |

## Project Structure

```
render-engine/
├── src/
│   ├── index.ts                     # Express server, auth middleware, health check
│   ├── config.ts                    # Env var loader (typed config object)
│   ├── types.ts                     # All TypeScript interfaces
│   ├── test-render.ts               # Local test: renders each template with sample data
│   ├── routes/
│   │   ├── render.ts                # POST /api/render/sync & /api/render/test
│   │   ├── templates.ts             # GET/POST /api/templates
│   │   ├── preview.ts               # POST /api/preview (base64 PNG, no upload)
│   │   └── design.ts                # POST /api/design (Claude prompt-to-template)
│   ├── engine/
│   │   ├── png-renderer.ts          # Canvas-based PNG compositor
│   │   ├── mp4-renderer.ts          # FFmpeg frame-by-frame video builder
│   │   ├── layout-engine.ts         # {{variable}} substitution, color variable map
│   │   ├── asset-loader.ts          # Remote image fetch with LRU cache (100 items), WebP→PNG via sharp
│   │   └── font-manager.ts          # Inter font registration (4 weights)
│   ├── services/
│   │   ├── r2-storage.ts            # R2 upload via @aws-sdk/client-s3, local fallback
│   │   ├── airtable.ts              # post_builder + test table CRUD with field ID mapping
│   │   └── claude.ts                # Template generation from natural language prompts
│   ├── templates/
│   │   ├── registry.ts              # In-memory store, Airtable ID mapping, auto-select
│   │   ├── schema.ts                # Zod schema for template validation
│   │   └── builtin/
│   │       ├── main-2-image.json    # 2 side-by-side images + text + CTA
│   │       ├── main-1-image.json    # 1 full-width image + text + CTA
│   │       ├── before-after.json    # 2 images with BEFORE/AFTER labels
│   │       ├── slideshow-base.json  # MP4: 5 image slides + outro with CTA
│   │       ├── bold-diagonal.json   # 1 image, primary colour bg, pill phone CTA
│   │       ├── card-stack.json      # 2 images in white cards, grey gradient bg
│   │       ├── hero-banner.json     # 1 image full bleed, dark overlay, CTA button
│   │       ├── minimal-split.json   # 1 image, 50/50 left-right split
│   │       └── gradient-overlay.json # 2 images, primary→secondary gradient bg
│   └── utils/
│       ├── color.ts                 # resolveColor(), hexToRgba(), isLightColor()
│       ├── text.ts                  # wrapText() with ellipsis, applyTextTransform()
│       └── image.ts                 # drawImageCover(), drawImageContain()
├── fonts/                           # Inter-Regular, Inter-Medium, Inter-SemiBold, Inter-Bold (TTF)
├── scripts/
│   ├── airtable-automation.js       # Production: paste into Airtable automation
│   └── airtable-automation-test.js  # Test table variant
├── Dockerfile                       # Multi-stage: builder (compile) + production (Cairo + FFmpeg)
├── railway.json                     # Health check on /health, restart on failure
├── package.json
├── tsconfig.json                    # ES2022, NodeNext, strict
└── .env.example
```

## API Endpoints

All `/api/*` routes require `X-Api-Key` header. Health check is public.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Railway health check (no auth) |
| POST | `/api/render/sync` | **Production:** Render from post_builder record ID |
| POST | `/api/render/test` | **Test:** Render from render_engine_test record ID |
| POST | `/api/preview` | Render with sample data, return base64 PNG (no upload) |
| GET | `/api/templates` | List all templates (metadata) |
| GET | `/api/templates/:id` | Get full template definition |
| POST | `/api/templates` | Save custom template |
| POST | `/api/templates/sync` | Force re-sync templates from Airtable |
| GET | `/api/templates/rotation-pool` | Get rotation pool for format/imageCount |
| GET | `/api/templates/managed` | List Airtable-managed templates |
| POST | `/api/templates/save-to-airtable` | Save template to Airtable |
| PUT | `/api/templates/:recordId/activate` | Toggle template active state |
| PUT | `/api/templates/:recordId/rotation` | Set rotation weight |
| POST | `/api/design` | Claude generates template JSON from prompt |
| POST | `/api/design/iterate` | Refine existing template via prompt |
| POST | `/api/design/save` | Save designed template to registry + Airtable |

## Render Flow

```
Airtable automation (checkbox) → POST /api/render/sync { recordId }
  1. Fetch record from Airtable (content, images, branding)
  2. Resolve template (explicit ID → Airtable mapping → auto-select)
  3. Download all images in parallel (user images + CTA images, with LRU cache)
     - WebP images auto-converted to PNG via sharp
  4. Route to PNG renderer (node-canvas) or MP4 renderer (FFmpeg)
  5. Upload output buffer to R2
  6. Write URL + status back to Airtable
  7. Return { success, outputUrl, templateUsed, renderTimeMs }
```

## Template System

### JSON Schema

Templates are declarative JSON defining layers on a 1080x1080 canvas. Each template has:

```typescript
{
  id: string;              // "main-2-image"
  name: string;            // "Main 2 Image Template"
  outputFormat: "png" | "mp4";
  width: 1080;
  height: 1080;
  imageCount: number;      // How many user images needed
  categoryKeys: string[];  // For auto-selection routing
  fps?: number;            // MP4 only
  transition?: { type, durationMs };  // MP4 only
  frames: FrameDefinition[];
}
```

### Layer Types

Layers are drawn in order (painter's algorithm). Each has `x, y, width, height` plus type-specific props:

| Type | Key Properties | Notes |
|------|---------------|-------|
| `image` | `source: "user_image"`, `index`, `fit: "cover"\|"contain"`, `borderRadius`, `shadow` | User photos |
| `text` | `content: "{{variable}}"`, `fontSize`, `fontWeight`, `color`, `align`, `maxLines`, `lineHeight`, `textTransform`, `letterSpacing` | Supports variable substitution |
| `rect` | `fill`, `borderRadius`, `stroke` | Backgrounds, buttons |
| `logo` | `fit`, `padding`, `background` | Company logo (legacy — templates now use cta_image) |
| `cta_image` | `variant: "landscape"\|"square"`, `fit`, `padding`, `background`, `borderRadius` | Pre-designed CTA composite (logo + phone + Call Now + service areas baked in) |
| `accent_bar` | `color` | Brand-colored bars |

### Variable Substitution

Text and color fields support `{{variable}}` syntax resolved at render time:

- **Text:** `{{title}}`, `{{subtitle}}`, `{{body}}`, `{{phone}}`, `{{company_name}}`, `{{service_areas}}`, `{{website}}`
- **Colors:** `{{primary_colour}}`, `{{secondary_colour}}` (also `$primary_colour` syntax)
- Arrays like service_areas are joined with `", "`

### Template Auto-Selection

When no `template_id` is set on the Airtable record, `autoSelectTemplate()` picks one using round-robin rotation:

1. Builds a **rotation pool** from active Airtable-managed templates matching the format (png/mp4), image count, and category
2. Uses **per-company round-robin state** stored on the Companies table (`template_rotation_state` field)
3. Falls back to **hash-based selection** from built-in templates when rotation unavailable

| Condition | Template Pool |
|-----------|--------------|
| 1 image (PNG) | All active PNG templates with `image_count: 1` |
| 2 images (PNG) | All active PNG templates with `image_count: 2` |
| 3+ images (MP4) | All active MP4 templates |
| Category = "before_after" | Always before-after |

### Airtable Template ID Mapping (Legacy)

The registry has a hardcoded `AIRTABLE_TO_BUILTIN` map in `registry.ts` for legacy Creatomate-era template record IDs. New templates use `builtin_id` field on the Templates table instead — no hardcoding needed.

### Template Management Table (render_engine_templates)

**Table ID:** `tblHCrlFPZ5BWZfTo`

New template management table with preview images, design prompts, and layout notes. Each record maps to a built-in template via `builtin_id`.

Fields: `name`, `builtin_id`, `output_format` (png/mp4), `image_count`, `active` (checkbox), `preview_image` (attachment), `description`, `design_prompt`, `category_keys` (multi-select), `layout_notes`

Query this table via Airtable MCP to get current template records and their `builtin_id` mappings.

The `render_engine_test` table has a linked record field `template` (fld2f8fW7MuLn7Ghv) pointing to this table. When rendering, the engine fetches the linked template's `builtin_id` to resolve which JSON template to use.

## Airtable Integration

### Tables & Base

- **Base:** appvZZBI4YecrNWaA (GHL Social Posting)
- **post_builder:** tblq2tMr297PYUIWW (production — uses field IDs with `returnFieldsByFieldId=true`)
- **render_engine_test:** tblfeZjV98IuUZecl (test — uses field names directly)
- **render_engine_templates:** tblHCrlFPZ5BWZfTo (template management with previews + prompts)
- **Companies:** tblzlQAXyuw8uPNMd (for company_name lookup)
- **Templates (legacy):** tblUyKwjLP72u5MyG

### Critical Field ID Mapping (post_builder)

The production endpoint uses field IDs, not names. These are hard-coded in `src/services/airtable.ts`:

```
content_title       → fldCM6Dgef0PVViEs
content_subtitle    → fld43kNgFk0rDbPwU
content_body        → fldaz9Or0QhO2Gsls
primary_colour      → fldQ0QepJsXzCTg65
secondary_colour    → fldjeU7LROn8kWlpl
logo                → fldj4dW0mmLhLdOwP
template_id         → fldF0iPxTbl24X9eg (linked record)
phone               → fldpj5WlISZxfZJJg
website             → fldW1zFYr6mt0KAfT
company_id          → fldGX1aLOzAH3fGNP (linked record)
user_image_1-8      → fldJSRWbGz5PwZf32 through fldZKjO1TNXZ4gEiD
final_output        → fld72zkew98o8jX3h (attachment)
final_output_url    → fldcAfXxlQsqq0h2s
render_status       → fld5acoyY6iVET2Wz
```

### CTA Images

Templates use pre-designed CTA images instead of individual logo/phone/company_name/service_areas layers. These are composite images (created externally) containing logo + phone number + "Call Now" + service areas baked into one graphic.

- **Landscape CTA Image** (~1584x672) — used in white panel of 2-image templates and bottom-right of 1-image template
- **Square CTA Image** (1024x1024) — available for slideshow outro frames
- Sourced from Companies table fields: `Square CTA Image`, `Landscape CTA Image`
- **Important:** The `logo` field on post_builder actually contains the Landscape CTA Image (not a company logo). The test table `logo` field is used as fallback for `landscape_cta_image_url`.
- Both `/api/render/sync` and `/api/render/test` routes load squareCtaImage and landscapeCtaImage and pass them to the renderer

### Gotchas

- **returnFieldsByFieldId=true** is required for production table (field names vary by view)
- **Lookup fields return arrays** even for single values — always unwrap with getText()/getAttachmentUrl()
- **company_name and service_areas** are NOT on post_builder — must be fetched from the linked companies table
- **Attachment fields** have nested structure: `[{ url, thumbnails: { full: { url } } }]`
- Test table uses plain field names, no field ID mapping needed
- **WebP images:** node-canvas (Cairo) cannot load WebP natively. `asset-loader.ts` uses `sharp` to detect and convert WebP→PNG before passing to canvas. Detection uses both content-type header and RIFF/WEBP magic bytes.
- **`logo` field is NOT a logo:** On post_builder, the `logo` attachment field contains the Landscape CTA Image, not the company logo

## Rendering Engine Details

### PNG Renderer (`png-renderer.ts`)

Uses node-canvas (Cairo) to composite layers onto a 1080x1080 canvas:

1. Create canvas → draw background (solid/gradient/image)
2. Iterate layers in order, skip if `visible: false`
3. Apply layer opacity if < 1
4. Return `canvas.toBuffer('image/png')`

Key rendering functions:
- `drawRect()` — Fill + optional stroke + border radius via `roundedRect()` path
- `drawImage()` — Cover or contain fit with optional shadow and border radius
- `drawText()` — Variable resolution → font string → wrapText() → draw with alignment
- `drawLogo()` — Contained image with optional background fill (legacy)
- `drawCtaImage()` — Renders landscape or square CTA composite with optional background + border radius
- `drawAccentBar()` — Simple filled rectangle

### MP4 Renderer (`mp4-renderer.ts`)

Renders each frame as a PNG, then composes with FFmpeg:

1. For each frame: `renderPng()` → write to temp dir as `frame_000.png`
2. Each frame is looped to its `durationMs` using FFmpeg `-loop 1 -t {seconds}`
3. Build xfade filter chain: `[0:v][1:v]xfade=transition=fade:duration=0.8:offset=2.2[v1]; ...`
4. Encode: libx264, preset fast, CRF 23, pixel format yuv420p
5. Output to temp file → read into Buffer → clean up
6. Returns MP4 buffer

### Text Rendering

- `wrapText(ctx, text, maxWidth, maxLines)` — Word-wraps text, truncates with "..." at maxLines
- `applyTextTransform(text, transform)` — uppercase / lowercase / none
- Vertical alignment: calculates total text height, offsets startY for middle/bottom
- Letter spacing: draws character-by-character with manual kerning

### Image Fitting

- **cover:** Calculate scale to fill box, center crop excess. Clip with border radius path.
- **contain:** Calculate scale to fit inside box, center with letterboxing. Clip with border radius path.

## Development

### Local Setup

```bash
# Install deps (needs Cairo dev libs for node-canvas)
brew install cairo pango libpng jpeg giflib librsvg pkg-config  # macOS
npm install

# Run dev server (hot reload)
npm run dev

# Run local test render (outputs to test-output-*.png)
npm run test:render

# Type check
npx tsc --noEmit

# Build
npm run build
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:
- `AIRTABLE_TOKEN` — Airtable PAT
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — Cloudflare R2 credentials
- `ANTHROPIC_API_KEY` — For design flow (optional for rendering)
- `RENDER_API_KEY` — API authentication (skip if empty = dev mode)

### Deploying to Railway

```bash
# Railway CLI scans parent dirs — always deploy from a /tmp copy
# IMPORTANT: Make fresh copy AFTER all file edits are complete (stale copies = stale deploys)
cp -r /Users/jeremymartin/Documents/Cursor/render-engine /tmp/render-engine-deploy
cd /tmp/render-engine-deploy

# Link is required for each new /tmp directory
railway link --project 3453ac5d-bc4c-4c31-8c11-6a99f5edb2b4 --service render-engine --environment production

# Deploy (must specify --service when project has multiple services)
railway up -d --service render-engine

# Set environment variables
railway variables --set "KEY=VALUE"

# Force redeploy (non-interactive)
railway redeploy -y
```

Docker build takes ~2 min on Railway (Cairo + FFmpeg + sharp installation).

### Testing via API

```bash
# Test endpoint (render_engine_test table)
curl -X POST "https://render-engine-production.up.railway.app/api/render/test" \
  -H "Content-Type: application/json" \
  -H "x-api-key: 24c9362a2258ae1a59ac104f7d712e6028ceabd74708352c72b101638ce6f60e" \
  -d '{"recordId":"rec33ILMD46vQiLSG"}'

# Production endpoint (post_builder table)
curl -X POST "https://render-engine-production.up.railway.app/api/render/sync" \
  -H "Content-Type: application/json" \
  -H "x-api-key: 24c9362a2258ae1a59ac104f7d712e6028ceabd74708352c72b101638ce6f60e" \
  -d '{"recordId":"recXXXXXXXXXXXXXX"}'
```

### Test Records (render_engine_test table)

Test records exist for all built-in templates using Top Spec Gas, GT Tree Felling, and Brano Industries data. Query the table via Airtable MCP to get current record IDs.

## Adding New Templates

1. Create a JSON file in `src/templates/builtin/` following the schema
2. Add the filename to the `files` array in `registry.ts` `loadBuiltinTemplates()`
3. If mapping from Airtable, add the record ID to `AIRTABLE_TO_BUILTIN` in `registry.ts`
4. If it should participate in auto-selection, update `autoSelectTemplate()` logic
5. Deploy to Railway

### Template Design Tips

- Canvas is always 1080x1080
- Use 20px outer padding for images
- Use 8px gaps between side-by-side images (544 - 516 - 20 = 8px gap)
- Border radius 16px on images looks good
- White footer section starts at y=720, height=360
- Accent bar: 12px height at y=1068
- All colors can use `{{primary_colour}}` / `{{secondary_colour}}` for brand theming

### Current Template Layouts (Creatomate-parity)

**main-2-image & before-after (2-image templates):**
- Dark bg (#111111), two images top (516x500 each at y=20), 8px gap
- Title: 60px bold white, centered, y=535, 170px height, 2 lines max
- White panel at y=720: `{{subtitle}}` text LEFT (x=36, w=420, 28px) + landscape CTA image RIGHT (x=470, 590x300)
- before-after adds BEFORE (red) / AFTER (green) pill badges on images

**main-1-image (full-bleed template):**
- Full-bleed user image as background
- Dark overlay at top (rgba(0,0,0,0.6), height=280) with title (52px) + subtitle (24px)
- Landscape CTA image bottom-right (x=480, y=780, 560x260) with white rounded background
- Accent bar at bottom

**Key:** White panel text uses `{{subtitle}}`, NOT `{{body}}` — matches Creatomate originals

## Airtable Automation

The Airtable automation triggers when `generate_final_image` checkbox is checked. The script in `scripts/airtable-automation.js` POSTs the record ID to the Railway API. The automation is currently ON for the test table.

To set up for production:
1. Create automation on post_builder table
2. Trigger: "When record matches conditions" → `generate_final_image` is checked
3. Action: "Run a script" with input variable `recordId` = Airtable record ID
4. Paste script from `scripts/airtable-automation.js`

## R2 Storage

- **Bucket:** social-post-images
- **R2 Access Key ID:** 1873d1a155e24606cc278ecbacb4fb23
- **Endpoint:** https://9cae6404b337b12ce3820fd7b9b81d43.r2.cloudflarestorage.com
- **Public URL prefix:** https://pub-6279ebe32d304c3b910ad4140492aca3.r2.dev
- **Path format:** `renders/{year}/{month}/{recordId}_{timestamp}.{ext}` (production) or `test-renders/{recordId}_{timestamp}.{ext}` (test)
- **Cache-Control:** `public, max-age=31536000, immutable`
- If R2 env vars are not set, falls back to local `/tmp/render-output` with Express static serving

## Error Handling

- Image download failures: logged as warnings, render continues without that image
- Template not found: auto-select fallback kicks in; if still not found, returns 404 + writes failed status to Airtable
- Airtable update failures in error path: caught silently (`.catch(() => {})`) so they don't mask the original error
- FFmpeg errors: wrapped in descriptive Error objects
- All API errors return `{ success: false, error: "message" }`
