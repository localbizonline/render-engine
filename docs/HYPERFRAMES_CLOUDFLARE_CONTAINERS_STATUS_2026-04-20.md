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
- `RENDER_API_KEY`

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
- Authenticated `POST /api/render/hyperframes` with an intentionally invalid body returned `400`
  - This confirmed request auth passed and validation handled the request instead of returning `401`.

The deployed config currently uses:

- `instance_type: standard-3`
- `max_instances: 1`
- `constraints.regions: ["WEUR"]`
- `scheduling_policy: "default"`
- `wrangler_ssh.enabled: true`

## Production status

The render host is live and is now the active production backend for Hyperframes traffic.

App-side production state in `social-posting-v2`:

- `HYPERFRAMES_RENDER_SERVICE_URL=https://render-engine-hyperframes.cf7-9ca.workers.dev`
- `HYPERFRAMES_RENDER_BACKEND=cloudflare`
- `HYPERFRAMES_RENDER_SERVICE_API_KEY=<set>`

Railway remains live only as the rollback path for Hyperframes.

## What still needs to be done

1. Run app-driven preview and final-render smoke tests against the production Cloudflare path and compare outputs against Railway baselines.
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
4. Watch production logs for:
   - render duration
   - verification summary
   - output keys and bytes written
   - error rate
5. Keep Railway available until Cloudflare has proven stable under real preview and queue-time load.

## Rollout recommendation

Current rollout position:

1. Cloudflare Containers is live for Hyperframes.
2. App-side Hyperframes routing and Hyperframes-only auth are configured.
3. Production is currently set to `HYPERFRAMES_RENDER_BACKEND=cloudflare`.
4. Roll back immediately by setting the selector back to `railway`.
