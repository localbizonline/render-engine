# Hyperframes Black-Frame Debug Log

Date: 2026-04-19

Scope:
- Variant: `Trust Strip v1`
- Variant id: `c00b1fc96282466086531a25519de17d`
- Primary caller: `social-posting-v2`
- Upstream renderer: `render-engine`

## Executive Summary

Production Hyperframes renders were intermittently producing black or near-black frames at exact timestamps around `5.0s`, `7.5s`, and `10.0s` in 15-second MP4s.

The core lesson from this incident:
- The composition itself was not the primary bug.
- The bug was production-only and lived in the Hyperframes capture/encode path on Linux.
- Fixing only the variant JS did not remove the issue.
- The durable fix had to happen in the production renderer path used by Railway.

Final production state after the last deploy:
- fully black frames by the original threshold `< 0.02`: `0`
- residual near-black frames by a stricter threshold `< 0.03`: `1` at `10.0s`

That means the original black-frame failure was effectively cleared, but a small residual boundary artifact remained under a stricter threshold.

## Original Symptom

Observed in live MP4 output rendered via:
- V2 -> `render-engine`
- Puppeteer / Hyperframes frame capture
- ffmpeg H.264 assembly

User-reported bad timestamps:
- `5.0s`
- `7.5s`
- `10.0s`

Those times line up with 30fps frame boundaries:
- `5.0s` -> frame `150`
- `7.5s` -> frame `225`
- `10.0s` -> frame `300`

## Architecture Notes

Relevant render path:
- `social-posting-v2` orchestrates run selection and persistence
- `render-engine` receives `/api/render/hyperframes`
- `src/providers/hyperframes.ts` builds a temporary project and shells out to the `hyperframes` CLI
- Hyperframes performs per-frame seek/capture and then ffmpeg encodes the MP4

Important implementation detail:
- Production Railway deploy was using Docker
- Docker installed both:
  - full `chromium`
  - `chrome-headless-shell`
- the container exported `PRODUCER_HEADLESS_SHELL_PATH=/usr/local/bin/chrome-headless-shell`

That production-only browser choice mattered.

## Inputs Used During Debug

Live org/content used repeatedly:
- org id: `527c47893ff74e0a83d88b457ca174b8`
- org name: `GT Tree Felling`
- title: `Another Massive Bluegum Down – Clean, Safe & Debris-Free`
- uploaded photo count: `6`
- duration: `15s`

Representative live runs inspected:
- pre-fix baseline: `af9f274fc8c34b6592c3e22ad3796b49`
- intermediate verification runs:
  - `cb5a9b60d0d44c829c03a849a4bd1830`
  - `aaed6c36e53f4d209a986ffc97bf742f`
  - `bd48c86cf5764f02a5a700ace8ade251`
  - `05d95e8f4c504ae0b3da4cc59332ba64`
  - `16290f37375b4f2fbd48d2ae02319d89`
- latest verification run after all deployed fixes:
  - `245afad6176b44d1ba81d35eb01970f6`

## Tests Performed

### 1. Compare raw local frame dumps vs final MP4 output

Why:
- to separate render-time corruption from decode/encode artifacts

What was found:
- existing local raw frame dumps in `/tmp/live_trust_strip/new*` already contained black PNGs before final MP4 analysis
- example: `new7` had fully black PNGs at frames `75-76` (`2.500s`, `2.5333s`)

Conclusion:
- not purely a final MP4 decode artifact
- something in the frame capture path could produce bad source frames

### 2. Download and scan the live production MP4

Baseline live run:
- `af9f274fc8c34b6592c3e22ad3796b49`

Frame extraction result:
- fully black frames `< 0.02`: `7`
- exact black range:
  - `7.5000s`
  - `7.5333s`
  - `7.5667s`
  - `7.6000s`
  - `7.6333s`
  - `7.6667s`
  - `7.7000s`

Near-black range `< 0.03`:
- around `5.0s`
- around `7.5s`
- around `10.0s`

Conclusion:
- live production artifact matched the user report

### 3. Inspect GSAP/timeline state directly with normal browser screenshots

Method:
- rebuilt live composition locally from the same snapshot JS/CSS/HTML
- used plain Playwright `page.screenshot()`
- sought timeline directly at:
  - `5.0`
  - `7.5`
  - `10.0`

What was found:
- DOM/computed styles were sane
- normal screenshots at those exact times were clean
- the composition was visibly painted

Conclusion:
- the variant timeline was not collapsing to black on its own
- the production corruption happened later in the capture/render stack

### 4. Check whether ffmpeg GOP/keyframe spacing explained the bug

Why:
- `2.5s` spacing can resemble GOP/keyframe cadence in some encodes

What was found:
- bad frames in production did not line up with I-frames
- sample from bad run:
  - `5.0s` -> `P`
  - `7.5s` -> `P`
  - `10.0s` -> `P`

Conclusion:
- not a simple “bad keyframe every GOP” explanation

### 5. Confirm whether the production route actually used `src/providers/hyperframes.ts`

Why:
- a deploy is meaningless if the live route bypasses the code change

What was found:
- `/api/render/hyperframes` in `src/routes/render.ts` calls `renderHyperframesComposition`
- so `src/providers/hyperframes.ts` was definitely on the production path

Conclusion:
- provider-level fixes were valid to pursue

### 6. Force Hyperframes into screenshot mode

Change:
- set `PRODUCER_FORCE_SCREENSHOT`

First mistake:
- used `'1'`

What was learned:
- Hyperframes `envBool()` only treats the literal string `"true"` as true

Conclusion:
- `'1'` silently did nothing
- production stayed on the old path

### 7. Prefer full Chromium over `chrome-headless-shell`

Why:
- Docker image installed full Chromium but also hardwired Hyperframes to headless shell
- production-only issue suggested the browser binary mattered

Change:
- when spawning Hyperframes, override `PRODUCER_HEADLESS_SHELL_PATH` with `PUPPETEER_EXECUTABLE_PATH` when available

Result:
- significantly reduced the issue
- after that deploy, only exact boundary frames remained problematic

Observed run after this stage:
- `bd48c86cf5764f02a5a700ace8ade251`

Scan result:
- fully black `< 0.02`: `1`
  - `7.5000s`
- near-black `< 0.03`: `3`
  - `5.0000s`
  - `7.5000s`
  - `10.0000s`

Conclusion:
- browser selection was part of the bug
- not the whole bug

### 8. Add a tiny seek bias in the bridge

Why:
- remaining failures were exactly at boundary timestamps
- suspected brittle seek-at-exact-frame behavior

Change:
- in `window.__hf.seek(t)`, shifted to `t + 0.001`

Result:
- no meaningful improvement in production

Conclusion:
- the remaining artifact was not solved by nudging the timeline time

### 9. Patch the packaged Hyperframes CLI screenshot path

Why:
- local normal screenshots were always clean
- Hyperframes’ bundled CLI used CDP `Page.captureScreenshot`
- production-only corruption suggested the screenshot implementation itself was part of the problem

Change:
- added `scripts/patch-hyperframes-cli.mjs`
- patched `node_modules/hyperframes/dist/cli.js`
- switched `pageScreenshotCapture()` from raw CDP screenshot capture to Playwright `page.screenshot()`
- wired the patch into `Dockerfile` so Railway applies it during build

Result:
- improved the output again
- one exact black frame still remained at `7.5s`

Observed run after this stage:
- `16290f37375b4f2fbd48d2ae02319d89`

Scan result:
- fully black `< 0.02`: `1`
  - `7.5000s`
- near-black `< 0.03`: `3`
  - `5.0000s`
  - `5.0333s`
  - `7.5000s`

Conclusion:
- screenshot implementation was another part of the problem
- still not sufficient alone

### 10. Patch Hyperframes H.264 encoder settings

Why:
- one exact black frame remained in the final MP4 even after screenshot-path cleanup
- wanted to reduce frame reordering / temporal dependence in H.264 output

Change:
- patched Hyperframes CLI encoder args to add:
  - `-g fps`
  - `-keyint_min fps`
  - `-sc_threshold 0`
  - `-bf 0`

This was also applied through `scripts/patch-hyperframes-cli.mjs` during Docker build.

Observed final verification run:
- `245afad6176b44d1ba81d35eb01970f6`

Final scan result:
- fully black `< 0.02`: `0`
- near-black `< 0.03`: `1`
  - `10.0000s` with mean `0.02614`

Conclusion:
- the original black-frame failure was cleared by the combination of:
  - forcing screenshot mode
  - preferring full Chromium
  - patching Hyperframes’ screenshot implementation
  - patching H.264 encoding settings

## What Did Not Fix It

These were tested or considered and did not solve the live production issue on their own:

- repeated variant animation rewrites alone
- relying only on local timeline inspection
- forcing screenshot mode with `PRODUCER_FORCE_SCREENSHOT='1'`
- changing seek time by `+0.001s` alone
- blaming GOP/keyframes alone
- assuming the variant was the only source of truth for the bug

## Files Changed

Primary repo changes:
- `src/providers/hyperframes.ts`
- `scripts/patch-hyperframes-cli.mjs`
- `Dockerfile`

Behavior added:
- provider-level production safeguards for Hyperframes child renders
- Docker-time patching of bundled Hyperframes CLI behavior

## Current Operational Guidance

If this issue regresses:

1. Verify the latest Railway deployment id is the expected one.
2. Trigger a fresh live render for the same variant and org inputs.
3. Extract all 450 frames:
   ```bash
   ffmpeg -i output.mp4 -vsync 0 frames/frame%04d.png
   ```
4. Scan luminance thresholds:
   ```bash
   python3 - <<'PY'
   from PIL import Image
   from pathlib import Path
   for idx, f in enumerate(sorted(Path('frames').glob('frame*.png'))):
       with Image.open(f) as im:
           rgb = im.convert('RGB').resize((1,1))
           mean = sum(rgb.getpixel((0,0))) / (3*255)
       if mean < 0.02:
           print('black', idx, idx/30, mean)
       elif mean < 0.03:
           print('near', idx, idx/30, mean)
   PY
   ```
5. Re-check:
   - browser binary selection
   - screenshot implementation path
   - H.264 encoder args in the patched Hyperframes CLI

## Residual Risk

The black-frame issue by the original threshold is cleared in the latest verified production run.

Residual note:
- one slightly dark frame remains at `10.0s` under a stricter `< 0.03` threshold
- that is materially better than the original symptom, but not mathematically perfect

If a future task needs complete elimination of even that residual frame, start from:
- the Docker-time Hyperframes CLI patch
- the exact boundary timestamps
- the production Linux/browser/encoder interaction rather than the composition JS alone

Important refinement on the residual:
- The remaining near-black frames in post-fix runs sit at exact clip-boundary timestamps that coincide with the composition's `CLIP_XFADE` midpoints (e.g. `introLen = 5.0s`, `proof0 -> proof1 = 10.0s`).
- At those midpoints both sibling `.clip` elements are at ~`0.5` opacity simultaneously, with `power1.inOut` easing on both `clipIn` and `clipOut`. That dip is composition math, not a capture-path race.
- So the right place to attack the residual is the composition's clip-transition easing, not more renderer patches. Cheap options:
  - asymmetric ease (`power3.out` on `clipIn`, `power3.in` on `clipOut`) so the combined alpha at midpoint is `~0.94` instead of `~0.75`
  - shorter `CLIP_XFADE` (e.g. `0.2s`) so the sub-threshold window doesn't land on a sampled frame
  - hard-cut at clip boundaries (set incoming opacity `1` and outgoing `0` on the same beat) — safe here because `.hf-proof` has `background: #000` and scrims mask the snap

## Session Addendum — 2026-04-19

Added after the initial doc write. Additional observations that are useful for future debuggers and composition authors.

### Composition patterns confirmed safe vs unsafe under paused-timeline seek

During the early "rewrite the variant" phase (before the real renderer fixes landed) several composition-only iterations were tried. They did not fix the production bug, but they did teach clear lessons about what survives Hyperframes' `tl.pause(); tl.seek(t, false);` driver loop:

Unsafe (confirmed to produce black / wrong-state frames at boundary seeks):
- `fromTo()` tweens with `immediateRender: true` (the default) on a paused timeline — GSAP's "from" state can leak across scenes at arbitrary seek times
- `tl.set(...)` inside the paused timeline as the only way an element ever receives a style — its "instant tween" state is not always reapplied on reverse / non-linear seek paths
- Async IIFE that awaits `Promise.all(img.decode())` before exposing `window.__timelines[...] = tl` — the hyperframes bridge's `window.__hf.duration` falls back to the root element's `data-duration` when `__timelines` is empty, so capture starts immediately while `tl.seek()` is still a no-op. Result: fully beige MP4, no animation, no content. Fire-and-forget preload is correct; preload-gated timeline registration is not.

Safe (confirmed deterministic under `tl.seek(t, false)`):
- `gsap.set(...)` calls outside the timeline to bake initial state into inline style before the timeline is constructed
- plain `tl.to(...)` tweens for all animated state transitions
- `tl.set(...)` inside the timeline only for hard-cut opacity swaps on elements that also have a `gsap.set` baseline
- `tl.to(slide + ' img', { scale })` for Ken-Burns on children of hard-cut opacity parents — the compositing layer stays stable because the alpha discontinuity is on the parent and the transform interpolation is on the child

### Post-fix verification, independent run

Independent verification render done after the user's renderer-layer fixes were deployed, using the exact same variant inputs and the same 450-frame / luminance-per-frame harness documented above:

- variant: `c00b1fc96282466086531a25519de17d` with Ken-Burns drift restored on slide `<img>` elements
- run id: `14eca1feeeea450bb99939b1246b771b`
- fully black `< 0.02`: `0`
- near-black `< 0.03`: `2`
  - `5.000s` mean `0.02334`
  - `10.000s` mean `0.02928`

Interpretation:
- agrees with the canonical final run `245afad6176b44d1ba81d35eb01970f6` on the `< 0.02` bar
- the extra near-black at `5.000s` in this run (vs. one in the canonical) is consistent with the `CLIP_XFADE` midpoint explanation above — `5.000s` is the `intro -> proof-0` boundary, `10.000s` is the `proof-0 -> proof-1` boundary
- so the renderer fix is holding, the residual is boundary-math, and small frame-count differences between otherwise-clean post-fix runs should be treated as crossfade sampling variance rather than regression

### What "just rewrite the variant" should be expected to do

This is the line the initial debug phase kept crossing, so it is worth stating directly:

- Variant JS changes can eliminate black frames that are caused by the variant itself (bad easing, `fromTo` on paused timelines, gated timeline registration, etc.).
- Variant JS changes cannot eliminate black frames that are caused by the capture path (`HeadlessExperimental.beginFrame` instability, `chrome-headless-shell` vs full Chromium, CDP `Page.captureScreenshot` edge cases) or by the encoder (frame reordering, `-bf`, GOP settings).
- If the same timestamps go black across multiple independent variant rewrites, that is a strong signal to stop editing the variant and look at the renderer. The cost of missing that signal in this incident was several iterations of composition changes that produced no meaningful improvement until `src/providers/hyperframes.ts` and the Docker-time CLI patch landed.
