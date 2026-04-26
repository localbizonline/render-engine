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

## Render-speed optimization instrumentation (2026-04-20 update)

Live version id: `59ed237e-635d-401a-afec-60960b68c120`.

Added to support benchmarking the Cloudflare render path without touching Railway:

### Per-runtime worker-count overrides

`resolveHyperframesWorkerCount()` in [src/providers/hyperframes.ts](/Users/jeremymartin/Documents/Cursor/render-engine/src/providers/hyperframes.ts) now reads runtime-specific env vars first, then falls back to the global override, then to the container default of `1`:

| Env var | Scope | Notes |
|---|---|---|
| `HYPERFRAMES_RENDER_WORKERS_CLOUDFLARE` | Cloudflare container only | Tune this to benchmark `workers>1` on Cloudflare without changing Railway |
| `HYPERFRAMES_RENDER_WORKERS_RAILWAY` | Railway container only | Kept for symmetry; default remains `1` |
| `HYPERFRAMES_RENDER_WORKERS` / `PRODUCER_MAX_WORKERS` | Global fallback | Existing behaviour preserved |

Runtime detection is explicit:

- Railway: `RAILWAY_ENVIRONMENT` or `RAILWAY_PUBLIC_DOMAIN` set
- Cloudflare: `CONTAINER=true` and not Railway
- Local: neither

### Per-phase render timings

Each `/api/render/hyperframes` and `/api/render/hyperframes/preview` response now includes a `meta.timings` object:

```
{
  cliMs,          // Hyperframes CLI render phase
  verifyMs,       // frame-gate scan (0 when skipped on preview mode)
  posterMs,       // separate ffmpeg pass for poster
  totalMs,        // wall time inside the provider
  workerCount,    // effective --workers value (null = CLI auto)
  runtime         // "cloudflare" | "railway" | "local"
}
```

The provider also logs a single line per render:

```
[hyperframes timing] runtime=cloudflare mode=final cliMs=... verifyMs=... posterMs=... totalMs=...
```

Container stdout is not reachable via `wrangler tail` today, so the HTTP response is the primary signal for benchmarking. The log line is still useful if/when Cloudflare container log access improves.

### Benchmark plan

Recommended order (before changing any defaults):

1. Fire 3–5 renders at current config (`workers=1`) against a known-good variant and photo set. Record `meta.timings` averages.
2. Decide based on the dominant phase:
   - `cliMs` dominates → set `HYPERFRAMES_RENDER_WORKERS_CLOUDFLARE=2`, redeploy, re-benchmark. `standard-3` = 2 vCPU, so `workers>2` is unlikely to help and can regress.
   - `verifyMs` dominates → evaluate a frame-gate sampling mode before touching workers.
   - `posterMs` dominates → fold poster capture into the main ffmpeg pass instead of a second invocation.
   - GSAP CDN fetch variance → bundle GSAP locally in the provider HTML.
3. Never remove frame-gate or `PRODUCER_FORCE_SCREENSHOT` in the first optimization pass — those were added to fix a real production black-frame issue.

Rollback path is unchanged: `HYPERFRAMES_RENDER_BACKEND=railway` on the app side flips traffic off Cloudflare.

## Follow-up production debugging result

Later on 2026-04-20, a real production `Job Showcase Reel v2` render was debugged end-to-end against this Cloudflare host and ultimately passed.

### What was learned

The main production bug was not “Cloudflare randomly makes everything black”.

It was specifically:

- the live request asked for `runtime.duration_seconds = 9`
- the saved composition root still carried baked `data-duration="15"`
- the provider only injected runtime duration when the root had no duration at all

That meant Cloudflare could render the intended `9s` animation and then keep capturing into stale tail time, which produced the original:

- `frames=450 black=182 dark=182`

### Renderer fix applied

`src/providers/hyperframes.ts` now overwrites the root `data-duration` when runtime duration is present, instead of bailing out when the attribute already exists.

Regression coverage was added in:

- `tests/http-routes.test.ts`

### What happened after the duration fix

The failure shrank to only clip-boundary frames:

- `frames=270 black=2 dark=2`
- then `frames=270 black=1 dark=1`

That proved the large failure was solved, and the remaining issue was a narrow intro/slideshow boundary problem rather than a full renderer/runtime failure.

### Final live result

After softening the intro → slideshow handoff in the template, the Cloudflare path passed with:

- run id: `0842893b91e04c3bb49d57f44d2ff5c7`
- verification summary: `frames=270 black=0 dark=0 dropouts=0`
- response status: `200`
- render time: about `81.9s`

The deployed Cloudflare Worker version for the passing run was:

- `12af35e3-791c-4d35-92c7-97842acf4761`

### Operational note

`wrangler deploy` for this host initially failed when forced onto the narrower `CLOUDFLARE_API_TOKEN` present in the shell environment. Re-running with that env var unset allowed Wrangler to use the broader cached OAuth login, which had the required `containers (write)` permission.

Practical deploy workaround on this machine:

```bash
env -u CLOUDFLARE_API_TOKEN -u CF_API_TOKEN npm run deploy:cf
```
