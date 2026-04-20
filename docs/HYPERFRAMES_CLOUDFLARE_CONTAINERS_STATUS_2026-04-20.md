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

## Current blocker

The actual Cloudflare Containers deploy is blocked by account entitlement, not by code.

Observed API failure when Wrangler attempted the real container publish:

- endpoint: `/accounts/9cae6404b337b12ce3820fd7b9b81d43/containers/me`
- Cloudflare response: `Unauthorized: You do not have access to Cloudflare Containers. Deploying containers requires the Workers Paid plan.`

This means:

- the Worker script can upload
- the Docker image can build
- the account cannot currently push/run the container

## What still needs to be done

1. Upgrade the Cloudflare account to a Workers plan that includes Containers.
2. Re-run:
   - `npx wrangler deploy --env=""`
3. Capture the resulting `workers.dev` URL or bind a custom route.
4. Set `RENDER_API_KEY` on this Worker to match the app's existing `RENDER_SERVICE_API_KEY`, or rotate both together.
5. Optionally add the remaining non-R2 secrets if needed for full production parity:
   - `DESIGNER_DEFAULT_V2_BASE_URL`
   - `DESIGNER_DEFAULT_V2_ADMIN_SECRET`
   - `V2_BASE_URL`
   - `V2_ADMIN_SECRET`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY` or `GOOGLE_API_KEY`
   - `GEMINI_VIDEO_MODEL`
6. Smoke test:
   - `GET /health`
   - `POST /api/render/hyperframes/preview`
   - `POST /api/render/hyperframes`

## Rollout recommendation

Do not point production Hyperframes traffic here immediately after the account upgrade.

Recommended sequence:

1. Deploy this render-engine host.
2. Leave `social-posting-v2` pinned to Railway with `HYPERFRAMES_RENDER_BACKEND=railway`.
3. Set `HYPERFRAMES_RENDER_SERVICE_URL` in the app to the new Cloudflare host.
4. Run smoke tests and compare Cloudflare outputs vs Railway outputs.
5. Flip the app to `HYPERFRAMES_RENDER_BACKEND=cloudflare` only after parity is confirmed.
6. Roll back by setting the selector back to `railway`.
