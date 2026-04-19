# Provider Experiment MVP Plan

## Implementation Status

Status as of 2026-04-17:

- Mostly implemented, but not fully complete
- Hyperframes-first MVP path is now working in `render-engine`
- Production rollout work is still intentionally out of scope

Implemented so far:

- `social-posting-v2`
  - read-only `GET /api/admin/experiment-posts/:id`
  - read-only `GET /api/admin/experiment-posts?limit=...&status=...`
- `render-engine`
  - Provider Lab workspace in the designer shell
  - V2 snapshot proxy via `GET /api/designer/v2/post?id=<postId>`
  - recent-post proxy via `GET /api/designer/v2/posts/recent?limit=...&status=...`
  - provider abstraction
  - Hyperframes provider implementation
  - Hyperframes template registry with multiple templates
  - Remotion stub provider
  - Provider Lab preview render
  - Provider Lab final render
  - saved MP4 + poster + manifest JSON
  - template picker in Provider Lab
  - saved run compare view in Provider Lab
  - recent-post picker in Provider Lab
  - recent saved run listing

Still to do for the full planned MVP shape:

- richer run review UI beyond the first compare pass
- inline manifest/debug inspection inside Provider Lab
- review notes or verdict capture for saved runs
- editable provider template management
- Remotion implementation

Detailed current-state doc:

- [FEATURE_2026-04-17_PROVIDER_LAB_STATUS.md](/Users/jeremymartin/Documents/Cursor/render-engine/FEATURE_2026-04-17_PROVIDER_LAB_STATUS.md)

## Goal

Add a new experimental provider workflow into `render-engine` so we can test alternative reel-template engines using real post data from `social-posting-v2` without integrating them into production rotation yet.

This MVP is for evaluation, not rollout.

We want to answer:

1. Can we author reel templates with a new engine more comfortably than the current render-engine flow?
2. Can we render real Local Pros posts through that engine and inspect the output?
3. Is the provider good enough to justify deeper production integration later?

## Recommendation

Do **not** implement both Remotion and Hyperframes fully at the same time.

The better MVP is:

1. add a provider-agnostic experiment harness inside `render-engine`
2. implement **Hyperframes first**
3. leave a clean provider boundary so Remotion can be added as a second provider later

Why Hyperframes first:

- it is easier to embed into the current `render-engine` dashboard model
- it is file/composition-oriented rather than requiring a React-native editor surface
- it matches the current “external studio + preview + render” architecture better
- it is easier to test quickly in a dashboard tab

Remotion can still be added later using the same harness, but it should be Phase 2 after the harness exists.

## Better Idea Than Direct DB Access

Do **not** make `render-engine` talk directly to the app database.

Instead:

- add a small read-only V2 post snapshot API in `social-posting-v2`
- proxy that API through the existing `render-engine` V2 bridge
- let the provider tab load a post by ID or browse recent posts

Why this is better:

- keeps ownership boundaries clean
- avoids duplicating DB logic in `render-engine`
- reuses the existing V2 bridge pattern already used for template export/import
- lets us test with real posts and real media, but without coupling the renderer to app internals

## Target MVP User Flow

Inside `render-engine`:

1. open new `Providers` or `Experiments` tab
2. choose provider:
   - `Hyperframes`
   - `Remotion (later)`
3. load a real V2 post
   - paste post ID
   - or browse recent posts from V2
4. map post data into provider inputs
5. choose a provider template
6. render preview
7. render final MP4
8. save output and metadata
9. view and compare past experiment runs in a gallery/list

This gives us an MVP test harness without touching production template linking or rotation.

## Scope

### In Scope

- new dashboard tab in `render-engine`
- provider abstraction
- Hyperframes provider implementation
- Remotion provider scaffold only
- load real posts from V2
- preview and final render
- save outputs for review
- run tests

### Out Of Scope

- production rotation logic
- theme/category assignment
- post scheduling
- replacing Creatomate in production
- writing approved provider templates back into `render_templates`
- full AI authoring parity

## MVP Architecture

### `social-posting-v2`

Owns:

- posts
- org metadata
- uploaded media
- current captions/text
- brand assets
- read-only post snapshot API for experiments

### `render-engine`

Owns:

- experiment dashboard
- provider selection
- mapping V2 post data into provider inputs
- preview rendering
- final rendering
- saved experiment outputs and metadata

## Core Decision: Post Snapshot Contract

The MVP should work from a **post snapshot**, not raw DB records.

### New V2 Endpoint

Add a read-only endpoint in `social-posting-v2`, for example:

- `GET /api/admin/experiment-posts/:id`

Implemented list endpoint:

- `GET /api/admin/experiment-posts?limit=20&status=ready`

### Suggested Response Shape

```json
{
  "post": {
    "id": "post_123",
    "org_id": "org_1",
    "category_id": "cat_5",
    "status": "ready",
    "created_at": "2026-04-17T08:00:00.000Z"
  },
  "content": {
    "title": "Recent Kitchen Renovation",
    "subtitle": "Completed in five days",
    "body": "Another premium finish for a Johannesburg client."
  },
  "brand": {
    "company_name": "Acme Kitchens",
    "primary_colour": "#235BAA",
    "secondary_colour": "#4582D0",
    "logo_url": "https://rep.localpros.co.za/..."
  },
  "media": {
    "image_urls": [
      "https://rep.localpros.co.za/...",
      "https://rep.localpros.co.za/..."
    ],
    "poster_url": null,
    "video_url": null
  },
  "platform_context": {
    "platforms": ["facebook", "instagram"],
    "variant": "reel"
  }
}
```

This should be intentionally flattened and renderer-friendly.

## Extend The Existing V2 Bridge In `render-engine`

`render-engine` already has a V2 proxy pattern in:

- `src/routes/designer.ts`
- `public/designer-v2-bridge.js`

Extend this rather than inventing a new auth path.

### New Proxy Endpoints In `render-engine`

Add:

- `GET /api/designer/v2/post?id=<postId>`
- `GET /api/designer/v2/posts/recent?limit=<n>&status=<status>`

These should:

- use the same configured V2 base URL + admin secret
- call the new V2 experiment-post endpoints
- return normalized JSON to the frontend

## New Dashboard Tab In `render-engine`

Add a new tab to the current dashboard rather than overloading the current reference-video flow.

Suggested tab name:

- `Provider Lab`

Alternative:

- `Experiments`

### Sections In The Tab

1. Provider selector
   - Hyperframes
   - Remotion (disabled or “coming next” at first)

2. V2 post loader
   - paste post ID
   - recent posts list
   - load snapshot

3. Template picker
   - local provider templates
   - duplicate/edit/create new

4. Render controls
   - preview
   - final render
   - aspect ratio
   - soundtrack on/off

5. Output viewer
   - preview player
   - saved output URL
   - render metadata

6. Experiment runs
   - saved runs list
   - provider
   - post ID
   - template name
   - created at
   - open output

## Provider Abstraction

Do not hard-code Hyperframes directly into the dashboard flow.

Create a small internal provider boundary.

### Suggested Interface

```ts
type ProviderId = 'hyperframes' | 'remotion';

interface PostSnapshot {
  post: { id: string; org_id: string };
  content: { title?: string; subtitle?: string; body?: string };
  brand: { company_name?: string; primary_colour?: string; secondary_colour?: string; logo_url?: string | null };
  media: { image_urls: string[]; poster_url?: string | null; video_url?: string | null };
}

interface ProviderTemplateSummary {
  id: string;
  name: string;
  provider: ProviderId;
  kind: 'portrait_reel';
}

interface ProviderPreviewResult {
  previewUrl?: string;
  posterUrl?: string;
  metadata?: Record<string, unknown>;
}

interface ProviderRenderResult {
  videoUrl: string;
  posterUrl?: string;
  metadata?: Record<string, unknown>;
}
```

Each provider implements:

- list templates
- create template
- duplicate template
- preview template with post snapshot
- render final with post snapshot

## Hyperframes MVP Plan

### Why Hyperframes First

Hyperframes is the easiest provider to prototype in this dashboard because:

- compositions are HTML/CSS/GSAP based
- preview/player embedding is straightforward
- it fits the “external creative studio” model better
- it does not require a React-native editing app to feel coherent

### Hyperframes MVP Scope

Implement:

- one portrait reel template family
- post snapshot to composition mapping
- preview inside the new Provider Lab tab
- final MP4 render and save

Start with:

- uploaded photos
- logo
- title
- subtitle
- one soundtrack
- a few transitions

### Hyperframes File Layout Suggestion

Inside `render-engine`, add:

- `src/providers/hyperframes/`
- `src/providers/hyperframes/templates/`
- `src/providers/hyperframes/service.ts`
- `src/providers/hyperframes/mappers.ts`
- `src/providers/hyperframes/storage.ts`

Suggested template storage:

- filesystem-backed MVP templates inside the repo or a writable template directory

Example:

- `provider-assets/hyperframes/templates/portrait-basic/`

### Hyperframes Preview Strategy

Use the Hyperframes player in the new dashboard tab for preview.

For MVP:

- preview can be composition-based
- final render can call Hyperframes CLI or producer

The dashboard only needs enough control to prove the concept.

### Hyperframes Render Strategy

Final render should:

1. create a temporary composition workspace for the chosen template
2. inject mapped post snapshot data
3. render MP4
4. save output to R2 or local output path
5. save experiment manifest

## Remotion MVP Plan

Do not fully implement Remotion in the first pass.

Instead, make the Provider Lab compatible with it:

- provider selector exists
- provider interface exists
- UI copy is generic enough
- experiment run model supports `provider = remotion`

Then add Remotion in Phase 2 if Hyperframes is promising but not sufficient.

### If Remotion Is Added Later

Suggested structure:

- `src/providers/remotion/`
- small embedded or linked React app for authoring
- API wrapper for preview/render

But this should come after the harness proves useful.

## Saved Outputs And Review UX

The MVP needs saved artifacts so you can inspect real results over time.

### Save Outputs

For each run, save:

- rendered MP4
- poster/thumbnail if available
- provider
- template ID
- post ID
- render timestamp
- optional notes

### Save Experiment Manifest

Create a simple manifest JSON for each run.

Suggested shape:

```json
{
  "id": "run_2026_04_17_001",
  "provider": "hyperframes",
  "template_id": "portrait-basic",
  "post_id": "post_123",
  "video_url": "https://...",
  "poster_url": "https://...",
  "created_at": "2026-04-17T10:00:00.000Z",
  "inputs": {
    "title": "Recent Kitchen Renovation",
    "image_count": 5
  },
  "metadata": {
    "render_ms": 4200
  }
}
```

### Storage Choice

For MVP:

- use existing `r2-storage.ts` if you want durable reviewable outputs
- fall back to local output during development

Suggested key pattern:

- `experiments/<provider>/<date>/<run-id>.mp4`
- `experiments/<provider>/<date>/<run-id>-poster.jpg`
- `experiments/<provider>/<date>/<run-id>.json`

## UI Implementation Phases

### Phase 1: Scaffold Provider Lab

Add:

- new tab in `designer.html`
- provider selector UI
- V2 post loader UI
- empty output list section

No real provider logic yet.

### Phase 2: V2 Post Snapshot Loading

In `social-posting-v2`:

- add read-only post snapshot endpoint

In `render-engine`:

- add matching V2 proxy route
- add frontend loader to fetch and display post snapshot

### Phase 3: Hyperframes Provider

Add:

- template registry
- post snapshot mapper
- preview path
- render path
- save output path

### Phase 4: Experiment History

Add:

- manifest save/load
- recent run list
- output viewer

### Phase 5: Remotion Scaffold

Add only:

- provider placeholder
- TODO hooks for preview/render

No full Remotion implementation yet.

## Better Than Full Production Integration

This is better than directly integrating a new provider into `social-posting-v2` because:

- you can test with real posts immediately
- you avoid schema churn in V2
- you avoid pretending a provider is production-ready before it is
- you can compare results side-by-side
- you can kill the experiment without cleaning up production logic

## Testing Plan

### `social-posting-v2`

Add tests for:

1. post snapshot endpoint returns correct normalized shape
2. missing post returns 404
3. media URLs and logo URLs are included as expected

### `render-engine`

Add tests for:

1. V2 proxy post fetch works
2. provider lab loader populates post snapshot correctly
3. Hyperframes provider can preview from a post snapshot
4. Hyperframes provider can render a final MP4 from a post snapshot
5. experiment manifests are saved correctly

### Manual Smoke Test

1. open Provider Lab
2. load real V2 post
3. choose Hyperframes template
4. preview
5. render final
6. confirm saved output appears in experiment history

## Execution Order

Recommended order:

1. add V2 post snapshot endpoint
2. extend `render-engine` V2 proxy
3. add empty Provider Lab tab
4. wire post loader
5. add Hyperframes provider
6. save outputs and manifests
7. add tests
8. optionally scaffold Remotion provider

## Success Criteria

This MVP is successful when:

1. you can open a new Provider Lab tab in `render-engine`
2. you can load a real post from `social-posting-v2`
3. you can render that post through Hyperframes
4. the output is saved and reviewable
5. you can run tests around the flow
6. the architecture leaves room for a later Remotion provider

## Suggested Next-Session Prompt

```text
We are working in `/Users/jeremymartin/Documents/Cursor/render-engine`.

Goal:
- Add an MVP "Provider Lab" tab for experimenting with new reel-template providers
- Use real posts from `social-posting-v2` via a read-only V2 post snapshot API
- Implement Hyperframes first
- Keep a provider abstraction so Remotion can be added later
- Save rendered outputs and manifests for review

Please start by:
1. auditing the current dashboard structure in `public/designer.html` and `public/designer-app.js`
2. proposing the exact files to add for a new Provider Lab
3. designing the minimal V2 post snapshot contract and matching render-engine proxy route
4. then implementing the Provider Lab scaffold before touching Hyperframes rendering
```
