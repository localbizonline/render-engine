# render-engine Video-Only Refactor Plan

Audit artifact for the video-only cutover. Companion to
`social-posting-v2/docs/PLAN_2026-04-17_NATIVE_FFMPEG_REEL_RENDERER.md` and
`social-posting-v2/docs/EXECUTION_2026-04-17_RENDER_ENGINE_MP4_CUTOVER.md`.

Verified: 2026-04-17. Backup of this repo lives at
`/Users/jeremymartin/Documents/Cursor/render-engine-backup-2026-04-17` (source
excluding `node_modules` and `dist`).

## 1. Goal And Scope

Strip `render-engine` to a focused MP4 slideshow renderer driven entirely by
`social-posting-v2`. Out of scope for this refactor:

- Template authoring / design studio (Claude, Gemini, Designer UI).
- Public PNG product endpoints. PNG compositor is retained as internal
  MP4 frame infrastructure only.
- Airtable-driven orchestration (already removed — `POST /api/render/sync`,
  `POST /api/render/test`, `/api/templates/managed|sync|save-to-airtable|…` all
  return `410`).

End state: `render-engine` exposes `POST /api/render` (MP4), `GET /health`, and
nothing else that the product relies on. v2 remains the control plane.

## 2. Ground Truth Correction

The companion execution playbook says v2 `src/lib/queue/video.ts` is "100%
Creatomate" and that "no branch calls `renderService.renderTemplate` for MP4".
That is **wrong**. The live queue dispatcher is `src/lib/queue.ts` (monolith),
not `src/lib/queue/video.ts` (stripped duplicate — unused in the build).

Evidence:

- `src/index.tsx:8` — `import { queueHandler } from './lib/queue'`. Node module
  resolution picks `src/lib/queue.ts` over the `src/lib/queue/` directory.
- `src/lib/queue.ts:2011` defines `handleVideoGeneration` which at line 2058
  calls `handleOwnedVideoGeneration(…)` when an active owned MP4 template
  resolves, with a Creatomate fallback at line 2094.
- `src/lib/queue.ts:1870` defines `handleOwnedVideoGeneration` — it already
  calls `renderService.renderTemplate({ outputFormat: 'mp4' })`.
- `src/lib/queue/video.ts` is a stripped Creatomate-only clone that is
  referenced only from `src/lib/queue/index.ts`, which is itself not imported.

Implication for the cutover plan:

- v2 **already has** the owned MP4 branch wired in, including rotation state,
  `_video_render_backend_used = 'owned'` metadata, and a Creatomate fallback
  that records `_video_render_fallback_from` / `_reason` / `_at` on `field_data`
  (`queue.ts:2077–2094`).
- Today it fails at the very first call because `render-engine` has **no root
  `POST /api/render` handler** — `routes/render.ts` only registers `/sync` and
  `/test`. Every owned attempt 404s and falls back to Creatomate.
- v2's current `RenderServiceRenderResponse` expects inline base64
  (`outputBase64` + `contentType`, decoded at `queue.ts:1925–1944` via
  `decodeBase64RenderPayload`). Phase 3 must either keep that shape **or**
  migrate v2 to the direct-R2 shape. The strategy doc commits to direct-R2; v2
  owns the cleanup of `decodeBase64RenderPayload` usage.
- Phase 4 (v2 test coverage) should not invent new tests wholesale: there are
  already `tests/owned-video-fallback.test.ts`, `tests/owned-static-fallback.test.ts`,
  and `tests/render-engine-functional-workflow.test.ts`. Extend those. The
  "total test count rises from 1083" line in the execution playbook is
  aspirational — measure against the current count after rebase.

Cleanup follow-up (v2, not this repo): delete `src/lib/queue/`
(`content.ts`, `helpers.ts`, `images.ts`, `index.ts`, `publish.ts`, `video.ts`)
once verified unreferenced. Not a blocker for the render-engine work, but it
is the source of the misleading ground-truth.

## 3. File-By-File Disposition

Scope of this inventory: everything under `src/`, `public/`, and top-level
config that affects the deployable surface.

### Keep (core render infrastructure)

| Path | Why |
|---|---|
| `src/config.ts` | Env-var config. Prune designer + Anthropic + Gemini blocks in Phase 4. |
| `src/index.ts` | Server bootstrap. Unchanged. |
| `src/app.ts` | Keep Express setup, health check, `x-api-key` middleware. Refactor: drop designer shell routes and static designer assets. |
| `src/engine/mp4-renderer.ts` | MP4 pipeline entry. **Do not delete `png-renderer.ts` — it is the frame compositor.** |
| `src/engine/png-renderer.ts` | Frame compositor for MP4. Keep as internal. |
| `src/engine/asset-loader.ts` | Loads user / logo / CTA images for the renderer. |
| `src/engine/font-manager.ts` | Registers fonts used by the canvas. |
| `src/engine/layout-engine.ts` | Variable resolution + colour helpers. |
| `src/services/r2-storage.ts` | R2 upload helper. Phase 2 extension: add `putAt(key, buf, ct)` for caller-specified keys and move the local filesystem fallback behind a dev flag. |
| `src/utils/color.ts` | Called by `png-renderer.ts`. |
| `src/utils/text.ts` | Called by `png-renderer.ts`. |
| `src/utils/image.ts` | Called by `png-renderer.ts`. |
| `src/templates/schema.ts` | Zod schema used to validate inline `templateJson` in the new root handler. |
| `src/templates/registry.ts` | Keep while the `GET /api/templates` and `GET /api/templates/:id` routes stay. Re-evaluate after Phase 4. |
| `src/templates/builtin/*.json` (11 files) | Small JSON fixtures; useful for local smoke tests. Total size trivial. |
| `fonts/` | Loaded by `font-manager.ts`. |

### Refactor

| Path | Change |
|---|---|
| `src/routes/render.ts` | Add `POST /` root handler per execution playbook §2.3. Keep `/sync` and `/test` returning `410` for external callers that may still hold stale URLs. |
| `src/services/template-preview.ts` | Currently used by `/api/preview` and `/api/design` for designer iteration. If `/api/design` is removed (Phase 4), the preview service can shed its sample-asset fallbacks. Keep v1 until the authoring removal lands. |
| `src/routes/preview.ts` | Keep as a private / internal endpoint for now — v2's `POST /api/admin/render-templates/preview` proxies through `renderService.previewTemplate`. Removal requires coordinated v2 cleanup. |
| `src/routes/templates.ts` | Keep `GET /`, `GET /:id`, `POST /`. Remove the remaining `410` Airtable stubs — they no longer serve a rollout purpose. |

### Remove (Phase 4, after MP4 cutover is live)

| Path | Notes |
|---|---|
| `src/routes/design.ts` | AI authoring endpoints (`/api/design`, `/vision`, `/video`, `/video/compare-iterate`). |
| `src/routes/designer.ts` | Designer proxy + bootstrap script. |
| `src/services/claude.ts` | Used only by `design.ts`. |
| `src/services/designer-chat.ts` | Used only by `designer.ts`. |
| `src/services/gemini-video.ts` | Used only by `design.ts`. |
| `public/designer.html` (60K) | Template Lab shell. |
| `public/designer-app.js` (100K) | Template Lab app. |
| `public/designer-canvas-editor.js` (44K) | Konva canvas editor. |
| `public/designer-v2-bridge.js` (12K) | Template Lab ↔ V2 bridge. |
| `public/designer-assets/` (964K) | Sample assets for the designer. Keep a small subset if `template-preview.ts` is retained. |
| `node_modules/konva/` (pinned via `konva` in `package.json`) | Remove dep after designer removal. |
| `@anthropic-ai/sdk`, `@google/genai`, `multer` (package.json) | Remove deps after `design.ts` + `designer.ts` are gone. |
| Designer shell route array in `src/app.ts` (lines 18–63) | Remove when the public files do. |

### Remove now (no callers, no rollout value)

| Path | Notes |
|---|---|
| `templates/sync`, `templates/save-to-airtable`, `templates/:id/activate`, `templates/:id/rotation` in `src/routes/templates.ts` | All return `410`. No internal or external caller depends on them. Dropping them reduces audit surface without changing behaviour. |

## 4. Current State Of `src/routes/render.ts`

Reproduced verbatim (commit-time state at 2026-04-17) so a reader knows the
baseline the new root handler replaces:

```ts
import { Router } from 'express';

export const renderRouter = Router();

function removedAirtableRenderMessage() {
  return {
    success: false,
    error: 'Airtable-driven render endpoints have been removed from render-engine. Use social-posting-v2 for production render orchestration.',
  };
}

renderRouter.post('/sync', (_req, res) => {
  res.status(410).json(removedAirtableRenderMessage());
});

renderRouter.post('/test', (_req, res) => {
  res.status(410).json(removedAirtableRenderMessage());
});
```

No root `POST /` handler exists. `POST /api/render` currently returns Express's
default 404. The execution playbook misreports this as a `410`.

## 5. MP4 Dependency Chain

The edges the video-only cutover must preserve:

```
POST /api/render                      (new, Phase 2)
  └─ src/routes/render.ts
       └─ assets via src/engine/asset-loader.ts
            └─ sharp (webp→png), node fetch, canvas.loadImage
       └─ src/engine/mp4-renderer.ts
            ├─ src/engine/png-renderer.ts            (per-frame compositor)
            │    ├─ src/engine/font-manager.ts       (registers fonts)
            │    ├─ src/engine/layout-engine.ts      (resolveVariables, colour vars)
            │    ├─ src/utils/color.ts
            │    ├─ src/utils/text.ts
            │    └─ src/utils/image.ts
            ├─ fluent-ffmpeg + system ffmpeg (via Dockerfile)
            └─ fs.writeFileSync / readFileSync on tmpdir frames
       └─ src/services/r2-storage.ts (putAt, new)
            └─ @aws-sdk/client-s3
       └─ poster extraction (ffmpeg -frames:v 1, new helper in Phase 2)
```

Deletions in Phase 4 must not break any arrow above. In particular,
`png-renderer.ts` is **not** a PNG-product endpoint and must stay.

## 6. V2 Dependencies That Block Phase 4 Cleanup

These v2 endpoints / UI entry points depend on render-engine authoring
endpoints and must be removed or gated **before** `src/routes/design.ts` and
`src/routes/designer.ts` are deleted:

| v2 location | What it depends on |
|---|---|
| `POST /api/admin/render-templates/import` | Receives pushes from `render-engine POST /api/designer/v2/import`. Remove the push path first, then this endpoint. |
| `GET /api/admin/render-templates/:id/export` | Consumed by `render-engine GET /api/designer/v2/export`. Remove the proxy first, then this endpoint. |
| `POST /api/admin/render-templates/:id/template-lab-session` | Mints the short-lived token that Template Lab uses to hit `GET …/export`. Remove after the designer UI is gone. |
| `POST /api/admin/render-templates/draft` | Creates an empty template and a Template Lab open URL. Either keep (and build a lightweight V2-only preview UI) or remove alongside the designer. |
| `POST /api/admin/render-templates/design` / `/design/iterate` / `/design/vision` | Thin proxies to `renderService.designTemplate` etc. Delete when `render-engine/src/routes/design.ts` goes. |
| `POST /api/admin/render-templates/preview` | Thin proxy to `renderService.previewTemplate`. Safe to keep (preview is internal). |
| Admin UI "Owned PNG Template Lab" entry point under `src/views/pages/admin/video-templates.tsx` (and nearby template admin screens) | Opens the designer URL. Needs removal once the designer is gone; otherwise it becomes a dead link. |

CLAUDE.md (both in `social-posting-v2` and in this repo) also needs to be
updated in the Phase 4 PR so the ownership boundary reads "video-only".

## 7. Dependency Chain For the Admin Control Plane Today

For completeness — describes what v2 does when a post with ≥ minimum uploads
reaches the video queue:

1. `src/lib/queue.ts:421` — dispatch on `generate-video`.
2. `handleVideoGeneration` (line 2011) resolves the owned selection via
   `resolveOwnedVideoRenderSelection` (line 1811), which requires
   `RENDER_SERVICE_URL` and an active MP4 row in `render_templates` for the
   resolved image count.
3. If owned selection exists, `handleOwnedVideoGeneration` (line 1870) posts
   to `POST /api/render` on render-engine with `outputFormat: 'mp4'` and
   currently expects `outputBase64` back.
4. On any throw, the owned attempt is logged (`_video_render_fallback_from =
   'owned'`), the Creatomate path continues, and an audit row
   `video_fallback` is emitted (line 2082).

Phase 3 of the cutover changes step 3's response contract (direct R2 keys,
drop base64). Step 4 stays as-is — keep the fallback through rollout.

## 8. Blockers — Reasons To Abandon Reuse And Start Fresh

None found. Arguments considered:

- **Tangle**: The authoring surface is large (claude.ts, designer-chat.ts,
  gemini-video.ts, ~120K of designer JS, konva). But it is cleanly siloed
  behind `/api/design*`, `/api/designer*`, and the designer static routes in
  `app.ts`. Removing it does not touch the MP4 pipeline.
- **Runtime cost of canvas + sharp + ffmpeg**: Already paid — the image is
  built today via `Dockerfile`, and the Railway deploy already runs it.
- **R2 bucket ownership**: Current `config.r2.bucketName` defaults to
  `render-engine-output`. Phase 2 will point it at `social-posting-media`
  through env vars — trivial change.
- **Template schema mismatch**: Draft templates produced by v2's
  `buildDraftTemplateJson` in `src/routes/api/admin/render-templates.ts:60`
  already match `render-engine/src/types.ts` (`imageCount`, `frames`, `width`,
  `height`, `outputFormat: 'mp4'`, `transition`, etc). No translation layer
  needed.

Building a fresh renderer would reproduce `mp4-renderer.ts`, `png-renderer.ts`,
`asset-loader.ts`, `layout-engine.ts`, font registration, and the FFmpeg xfade
chain — all working, all tested by `test:render`. Reuse is the cheaper path.

## 9. Exit Criteria For This Artifact

- [x] Backup exists at `/Users/jeremymartin/Documents/Cursor/render-engine-backup-2026-04-17`.
- [x] Keep / refactor / remove list produced and grounded in current files.
- [x] Current state of `src/routes/render.ts` captured verbatim.
- [x] MP4 dependency chain documented.
- [x] v2-side authoring dependencies enumerated.
- [x] Blockers assessed; none justify starting fresh.

Phase 2 can start: implement `POST /api/render` in `src/routes/render.ts` and
extend `src/services/r2-storage.ts` with a caller-specified-key upload.
