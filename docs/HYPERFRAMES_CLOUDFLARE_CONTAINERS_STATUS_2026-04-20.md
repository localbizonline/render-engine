# Hyperframes Cloudflare Containers Status

Date: 2026-04-20

## What was implemented

- Added a Cloudflare Worker + Container entrypoint:
  - [src/cf-worker.ts](/Users/jeremymartin/Documents/Cursor/render-engine/src/cf-worker.ts)
  - [src/cf-proxy.ts](/Users/jeremymartin/Documents/Cursor/render-engine/src/cf-proxy.ts)
- Added Cloudflare deployment config:
  - [wrangler.jsonc](/Users/jeremymartin/Documents/Cursor/render-engine/wrangler.jsonc)
- Kept the existing Dockerized Express server as the runtime. No FFmpeg/Chromium/Hyperframes logic was moved into plain Workers.
- Restricted the Worker proxy to:
  - `GET /health`
  - `POST /api/render/hyperframes`
  - `POST /api/render/hyperframes/preview`
- Added Hyperframes request logging in [src/routes/render.ts](/Users/jeremymartin/Documents/Cursor/render-engine/src/routes/render.ts) with:
  - route
  - mode
  - duration
  - container instance id
  - output keys
  - byte counts
  - verification summary
  - error reason
- Added Cloudflare proxy tests in [tests/cloudflare-worker.test.ts](/Users/jeremymartin/Documents/Cursor/render-engine/tests/cloudflare-worker.test.ts).
- Added Wrangler/container scripts in [package.json](/Users/jeremymartin/Documents/Cursor/render-engine/package.json):
  - `npm run dev:cf`
  - `npm run check:cf`
  - `npm run deploy:cf`

## Verification

- `npm test`
  - Result on 2026-04-20: `62/62` tests passing.
- `npm run check:cf`
  - Full container build completed successfully on 2026-04-20.

The dry-run proved:

- Dockerfile builds successfully for the Cloudflare Containers path.
- Chromium, FFmpeg, fonts, and headless shell all build into the image.
- Wrangler accepts the Worker + Durable Object + container configuration.

## Cloudflare-side setup completed

Secrets added to the render-engine Worker:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

An R2 token was created for the `social-post-images` bucket with bucket-scoped read/write permissions so the render host can:

- write caller-owned MP4/poster artifacts
- read/list artifacts for local runtime paths that already depend on R2 access

## Current live state

The Cloudflare Containers deploy succeeded after the account was upgraded and the Wrangler config was corrected to use a supported scheduling policy.

Live deployment details:

- Worker URL: `https://render-engine-hyperframes.cf7-9ca.workers.dev`
- Worker version id: `3116849d-7106-435a-8cab-5d5d8afeb9f4`
- Container application id: `a03b2ec9-df51-49ad-90df-1f2f1e2e215c`

Known-good smoke check on 2026-04-20:

- `GET /health` returned `200`

The deployed config currently uses:

- `instance_type: standard-3`
- `max_instances: 1`
- `constraints.regions: ["WEUR"]`
- `scheduling_policy: "default"`
- `wrangler_ssh.enabled: true`

## Remaining blocker before production traffic

The render host is live, but the main production app is still pinned to Railway on purpose.

The remaining gating item before switching real Hyperframes traffic is shared auth:

- `social-posting-v2` already has a production `RENDER_SERVICE_API_KEY`
- this Cloudflare render host does not yet have a matching `RENDER_API_KEY`
- if we flip traffic now, the host is reachable, but auth is not aligned the way production should be

Until auth is aligned, production should stay on:

- `HYPERFRAMES_RENDER_BACKEND=railway`

## What still needs to be done

1. Set `RENDER_API_KEY` on this Worker to match the app's existing `RENDER_SERVICE_API_KEY`, or rotate both together.
2. Optionally add the remaining non-R2 secrets if needed for full production parity:
   - `DESIGNER_DEFAULT_V2_BASE_URL`
   - `DESIGNER_DEFAULT_V2_ADMIN_SECRET`
   - `V2_BASE_URL`
   - `V2_ADMIN_SECRET`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY` or `GOOGLE_API_KEY`
   - `GEMINI_VIDEO_MODEL`
3. Smoke test:
   - `GET /health`
   - `POST /api/render/hyperframes/preview`
   - `POST /api/render/hyperframes`

## Rollout recommendation

Do not point production Hyperframes traffic here immediately after the account upgrade.

Recommended sequence:

1. Leave `social-posting-v2` pinned to Railway with `HYPERFRAMES_RENDER_BACKEND=railway`.
2. Keep `HYPERFRAMES_RENDER_SERVICE_URL` in the app pointed at this Cloudflare host.
3. Align auth by setting `RENDER_API_KEY` here to the production app's render-service key, or rotate both together.
4. Run smoke tests and compare Cloudflare outputs vs Railway outputs.
5. Flip the app to `HYPERFRAMES_RENDER_BACKEND=cloudflare` only after parity is confirmed.
6. Roll back by setting the selector back to `railway`.
