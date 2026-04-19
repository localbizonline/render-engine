---
name: hyperframes-template-authoring
description: Author HTML templates that render correctly through the HyperFrames CLI (`hyperframes render`). Use when adding a new provider, writing a new `buildXHtml` helper, or debugging "blank mp4" renders from the render-engine service. Covers the `window.__hf` contract, the GSAP→__hf bridge, and the live verification steps that catch blank-frame regressions before they hit production.
---

# HyperFrames Template Authoring

Use this skill any time you author or modify HTML that gets handed to the HyperFrames CLI (`hyperframes render`) — for example, new templates in `src/providers/`, new `buildXHtml` helpers, or a new provider that produces its own HTML document.

## Background

HyperFrames' frame capture pipeline polls the rendered page for `window.__hf = { duration, seek }` and times out after 45s if it never appears. When that happens the mp4 contains no real frames — Railway silently ships a blank/empty video. The render-engine service was broken by this in production before the `__hf` bridge landed in `src/providers/hyperframes.ts`.

HyperFrames auto-injects its runtime on **studio/preview** routes only. The CLI `render` path does NOT auto-inject. Any HTML reaching the CLI must bring the contract itself.

## The Contract

Every HTML document sent to `hyperframes render` must satisfy all three:

1. **Root element** carries `data-composition-id` AND `data-duration` in seconds.
2. **Some driver** for time-based animation (GSAP timeline, a custom player, etc.).
3. **`window.__hf`** exposed globally, matching `{ get duration(): number, seek(t: number): void }`.

If any of the three is missing, the render produces a blank mp4.

## Working Skeleton

Copy this as a starting point. It uses GSAP + the shared `__hf` bridge that reads from `window.__timelines`.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      #root { position: relative; width: 1080px; height: 1920px; background: #0a1321; color: #fff; }
    </style>
  </head>
  <body>
    <div id="root"
         data-composition-id="my-composition"
         data-start="0"
         data-duration="6"
         data-width="1080"
         data-height="1920">
      <!-- scene elements here -->
    </div>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      // ...fromTo / to calls that drive your scene...
      window.__timelines["my-composition"] = tl;
    </script>

    <!-- Required bridge — without this, HyperFrames produces a blank mp4 -->
    <script>
      (function(){
        function timelines(){ return Object.values(window.__timelines || {}); }
        function timelineDuration(tl){
          if (!tl) return 0;
          if (typeof tl.duration === 'function') { try { return Number(tl.duration()) || 0; } catch(_) { return 0; } }
          if (typeof tl.duration === 'number') return tl.duration;
          return 0;
        }
        function declaredDuration(){
          var r = document.querySelector('[data-composition-id]');
          if (!r) return 0;
          var d = Number(r.getAttribute('data-duration'));
          return Number.isFinite(d) && d > 0 ? d : 0;
        }
        window.__hf = {
          get duration(){
            var t = timelines(), m = 0;
            for (var i = 0; i < t.length; i++) { var d = timelineDuration(t[i]); if (d > m) m = d; }
            return m > 0 ? m : declaredDuration();
          },
          seek: function(t){
            var ts = timelines();
            for (var i = 0; i < ts.length; i++) {
              var tl = ts[i]; if (!tl) continue;
              try { if (typeof tl.pause === 'function') tl.pause(); } catch(_) {}
              try {
                if (typeof tl.seek === 'function') tl.seek(t, false);
                else if (typeof tl.time === 'function') tl.time(t);
              } catch(_) {}
            }
          }
        };
      })();
    </script>
  </body>
</html>
```

The same bridge script lives as `HYPERFRAMES_HF_BRIDGE_SCRIPT` in `src/providers/hyperframes.ts`. For new providers or builders in that file, reuse that constant rather than duplicating it.

## Authoring Workflow

1. Draft the HTML builder (or provider template) with the skeleton above.
2. Register each timeline on `window.__timelines[<composition-id>]` — the lint in HyperFrames will warn if you don't, and duration inference will fall back to `data-duration` only.
3. Include the `__hf` bridge script — either inline (new providers) or by referencing the existing `HYPERFRAMES_HF_BRIDGE_SCRIPT` constant in `src/providers/hyperframes.ts`.
4. Typecheck: `npx tsc --noEmit`
5. Run tests: `npm test`

## Verification (required before shipping)

A blank-frame bug is silent. Always verify at least one of:

### Local verification

Run the HyperFrames CLI directly against your generated HTML. Any non-trivial render should produce an mp4 larger than ~50KB for a 2s clip:

```bash
# From render-engine repo root:
mkdir -p /tmp/hf-probe && cp <your-generated.html> /tmp/hf-probe/index.html
./node_modules/.bin/hyperframes render /tmp/hf-probe \
  --output /tmp/hf-probe/out.mp4 --fps 30 --quality draft

# Blank output red flags:
# - stdout contains: "[FrameCapture] window.__hf not ready after 45000ms"
# - out.mp4 missing or < 5KB
# - ffprobe reports nb_frames=0 or a black luma signal

ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,nb_frames,duration \
  -of default=nw=1 /tmp/hf-probe/out.mp4
```

### Railway verification

If the local render passes, deploy and probe inside the live container:

```bash
railway ssh "cd /app && /app/node_modules/.bin/hyperframes render <projectDir> \
  --output /tmp/out.mp4 --fps 30 --quality draft && \
  ffprobe -v error -show_entries stream=nb_frames,duration /tmp/out.mp4 && \
  ls -la /tmp/out.mp4"
```

A healthy render on Railway:
- completes in < 10s for a short clip
- produces an mp4 well above 50KB for a 2s non-trivial composition
- `ffmpeg -i out.mp4 -vf signalstats ...` shows varying luma (YMAX/YAVG differ across frames)

A failing render:
- hangs near 5% progress and prints `window.__hf not ready`
- exits non-zero or writes no mp4

## When a Render Goes Blank Anyway

If verification fails with `window.__hf not ready`, check in this order:

1. Is the bridge `<script>` actually present in the final HTML? Dump the HTML string the provider builds and `grep` for `window.__hf`.
2. Is a `data-composition-id` element in the DOM? The HyperFrames lint warns `root_composition_missing_data_duration` when `data-duration` is missing — treat it as load-bearing.
3. Is GSAP (or whatever driver you use) actually loaded by the time the bridge script runs? The bridge must come AFTER any timeline registration.
4. Does `window.__timelines[id]` exist and have a non-zero `.duration()`? If timelines are registered but empty, duration falls back to `data-duration` — which must be set.

## Do Not

- Do not rely on HyperFrames auto-injecting its runtime. It only does that on studio/preview HTTP routes.
- Do not ship HTML with a root composition but no `data-duration`. Duration inference drifts to Infinity and breaks playback.
- Do not skip the Railway verification when touching provider HTML. The blank-frame bug presents identically to a successful render in log tail — the only honest signal is inspecting the mp4.

## Related

- `src/providers/hyperframes.ts` — reference implementation and the `HYPERFRAMES_HF_BRIDGE_SCRIPT` constant.
- `CLAUDE.md` — "HyperFrames Template Authoring Contract" section mirrors the summary here.
- HyperFrames docs: https://hyperframes.heygen.com/guides/rendering
