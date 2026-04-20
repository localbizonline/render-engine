# Hyperframes Template Hardening

Date: 2026-04-19

## Purpose

This document records the durable guardrails added after the Hyperframes single-frame dropout incidents.

Use it when:

- authoring a new Hyperframes template
- debugging a one-frame flash where a photo, logo, or card interior disappears
- reviewing whether a template is safe for production rollout

## The Failure Pattern

The recurring production bug is not "the whole frame went black."

The recurring bug is:

- the parent container still renders
- the child content inside that container disappears for exactly one frame
- the next frame is normal again

Confirmed examples:

- photo card stays visible, but the photo inside it disappears for one frame
- white logo square stays visible, but the logo inside it disappears for one frame

That is a render-timing/compositor-layer problem. It means capture happened after the scene container painted but before a nested child layer fully settled.

## What Is Hardened In The Renderer

Production Hyperframes final renders now have two renderer-side protections:

1. The capture path settles after every seek

- Hyperframes now seeks the composition, then waits for a settle phase before screenshot capture.
- The settle phase waits for:
  - `document.fonts.ready`
  - unresolved `img.decode()` promises
  - two nested `requestAnimationFrame` ticks

2. Final MP4s go through an automated frame gate before upload

- The frame gate extracts the rendered MP4 into frames
- downsamples each frame
- scans for:
  - fully black frames
  - unusually dark frames
  - single-frame localized dropouts where frame `N` differs strongly from `N-1` and `N+1`, but `N-1` and `N+1` still match

If the frame gate finds:

- black frames, or
- single-frame localized dropouts

the final render fails before upload.

Preview renders are not frame-gated by default because doing a full extract-and-scan on every authoring preview would add too much latency. Set `HYPERFRAMES_VERIFY_PREVIEW=true` if you explicitly want preview renders scanned too.

## Template Rules

These are now the preferred authoring rules for all new Hyperframes templates.

### Do

- keep critical visible content on the same painted layer whenever possible
- use `background-image` on the visible card/container instead of a nested `<img>` when practical
- animate the outer container rather than a nested child image/logo layer
- keep scene state deterministic under `tl.pause(); tl.seek(t, false)`
- preload assets opportunistically, but do not gate timeline registration on preload completion
- use hard cuts or z-order swaps instead of fragile one-frame nested fades when a card/photo/logo changes state

### Do Not

- put a critical `<img>` inside an animated parent card if that parent can remain visible without the child
- build a visible "logo shell" whose child logo image is the only thing carrying the brand mark
- animate opacity on both parent and child at the same time for important visible content
- rely on `requestAnimationFrame` for animation logic inside compositions
- delay `window.__timelines[...] = tl` until after `Promise.all(img.decode())`

## High-Risk Patterns

Treat these as suspicious until proven stable:

- photo card with nested `<img>` plus parent opacity/scale animation
- white square logo card with nested `<img>`
- nested image transform animation plus parent opacity animation
- exact frame-boundary content swaps
- any template where the parent shell remains meaningful if the child content fails to paint

## Manual Verification

To scan an exported MP4 manually:

```bash
npm run scan:hyperframes-video -- /absolute/path/to/video.mp4
```

The scanner returns:

- black-frame count
- dark-frame count
- one-frame dropout candidates
- exact frame indexes and timestamps

Exit codes:

- `0` = passed
- `2` = anomalies found
- `1` = operational failure running the scan

## Review Checklist

Before approving a new template or a large visual rewrite:

1. Check whether critical photos/logos live on nested child layers.
2. Simplify those layers before rollout if they do.
3. Render a real MP4 through the final Hyperframes path.
4. Run the scanner or confirm the final render path passed the automatic gate.
5. If a flash is reported, inspect the parent shell versus child content separately.

## If This Regresses

Start here, in order:

1. Confirm whether the frame gate failed or passed.
2. Pull the MP4 and scan it manually with `npm run scan:hyperframes-video -- ...`.
3. Inspect whether the parent container survives while child content disappears.
4. If yes, flatten the visible layer before rewriting the whole composition.
5. Read `docs/HYPERFRAMES_BLACK_FRAME_DEBUG_2026-04-19.md` for the deeper incident history.
