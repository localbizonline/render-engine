import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import type {
  ProviderExperimentProvider,
  ProviderLabPostSnapshot,
  ProviderRenderArtifacts,
  ProviderLabTemplateDefinition,
} from './types.js';
import { scanVideoForHyperframesFrameIssues } from '../utils/hyperframes-frame-gate.js';

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 30;
const PROVIDER_ID = 'hyperframes';
const BASIC_TEMPLATE_ID = 'hyperframes-basic-v1';
const SPLIT_TEMPLATE_ID = 'hyperframes-split-panel-v1';
const RECENT_JOB_LOOP_TEMPLATE_ID = 'hyperframes-recent-job-hs-loop-v1';

const HYPERFRAMES_TEMPLATES: ProviderLabTemplateDefinition[] = [
  {
    id: BASIC_TEMPLATE_ID,
    label: 'Bold Editorial',
    description: 'Full-bleed imagery with oversized headline copy and a cinematic outro card.',
    status: 'ready',
  },
  {
    id: SPLIT_TEMPLATE_ID,
    label: 'Split Panel',
    description: 'Structured left-panel copy treatment with stacked photo cards for a calmer comparison.',
    status: 'ready',
  },
  {
    id: RECENT_JOB_LOOP_TEMPLATE_ID,
    label: 'Recent Job Loop',
    description: 'Home services recent job gallery with full-bleed AI-edited photos, brand overlay, and seamless loop end card.',
    status: 'ready',
  },
];

type HyperframesRenderOverride = (input: {
  htmlDocument: string;
  mode: 'preview' | 'final';
}) => Promise<ProviderRenderArtifacts>;

export interface HyperframesCompositionAssetManifest {
  uploaded_photos?: Array<{
    index?: number;
    url: string;
    kind?: 'image';
  }>;
  logos?: {
    logo_url?: string | null;
    square_logo_url?: string | null;
  };
  cta_assets?: {
    landscape_url?: string | null;
    square_url?: string | null;
  };
}

export interface HyperframesCompositionRenderInput {
  compositionHtml?: string | null;
  compositionCss?: string | null;
  compositionJs?: string | null;
  slotConstraints?: Record<string, unknown> | null;
  props?: Record<string, unknown> | null;
  assets?: HyperframesCompositionAssetManifest | null;
  mode: 'preview' | 'final';
}

let renderOverride: HyperframesRenderOverride | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeScriptText(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

const HYPERFRAMES_HF_BRIDGE_SCRIPT = `
(function(){
  function timelines(){
    return Object.values(window.__timelines || {});
  }
  function timelineDuration(tl){
    if (!tl) return 0;
    if (typeof tl.duration === 'function') { try { return Number(tl.duration()) || 0; } catch(_) { return 0; } }
    if (typeof tl.duration === 'number') return tl.duration;
    return 0;
  }
  function declaredDuration(){
    var root = document.querySelector('[data-composition-id]');
    if (!root) return 0;
    var d = Number(root.getAttribute('data-duration'));
    return Number.isFinite(d) && d > 0 ? d : 0;
  }
  function fallbackDuration(){
    var d = Number(window.__HYPERFRAMES_DURATION_SECONDS__);
    if (Number.isFinite(d) && d > 0) return d;
    return 6;
  }
  window.__hf = {
    get duration(){
      var tls = timelines();
      var max = 0;
      for (var i = 0; i < tls.length; i++) {
        var d = timelineDuration(tls[i]);
        if (d > max) max = d;
      }
      if (max > 0) return max;
      var declared = declaredDuration();
      if (declared > 0) return declared;
      return fallbackDuration();
    },
    seek: function(t){
      // Production captures were intermittently hitting black/near-black
      // frames when seeking to exact frame-boundary timestamps like 5.000s,
      // 7.500s, and 10.000s. Bias the seek forward by 1ms so capture lands
      // just inside the target frame instead of on a brittle boundary.
      var safeT = Math.max(0, Number(t) + 0.001);
      var tls = timelines();
      for (var i = 0; i < tls.length; i++) {
        var tl = tls[i];
        if (!tl) continue;
        try { if (typeof tl.pause === 'function') tl.pause(); } catch(_) {}
        try {
          if (typeof tl.seek === 'function') tl.seek(safeT, false);
          else if (typeof tl.time === 'function') tl.time(safeT);
        } catch(_) {}
      }
    },
    settle: async function(){
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      } catch (_) {}
      try {
        var images = Array.prototype.slice.call(document.images || []);
        var pending = [];
        for (var i = 0; i < images.length; i++) {
          var img = images[i];
          if (!img || typeof img.decode !== 'function') continue;
          if (img.complete && img.naturalWidth > 0) continue;
          pending.push(img.decode().catch(function(){}));
        }
        if (pending.length > 0) {
          await Promise.all(pending);
        }
      } catch (_) {}
      if (typeof requestAnimationFrame === 'function') {
        await new Promise(function(resolve){
          requestAnimationFrame(function(){
            requestAnimationFrame(function(){
              resolve(undefined);
            });
          });
        });
      }
    },
  };
})();
`;

function pickColor(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function shorten(value: string | null | undefined, maxLength: number): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function pickDistinctText(
  values: Array<string | null | undefined>,
  used: string[] = [],
): string {
  const usedSet = new Set(
    used
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  );

  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed) continue;
    if (usedSet.has(trimmed.toLowerCase())) continue;
    return trimmed;
  }

  return '';
}

function resolvePostCopy(
  snapshot: ProviderLabPostSnapshot,
  limits: {
    title: number;
    accent: number;
    body: number;
  },
) {
  const title = pickDistinctText([
    snapshot.content.title,
    snapshot.content.subtitle,
    snapshot.content.body,
  ]);
  const accent = pickDistinctText([
    snapshot.content.subtitle,
    snapshot.content.body,
  ], [title]);
  const body = pickDistinctText([
    snapshot.content.body,
    snapshot.content.subtitle,
  ], [title, accent]);

  return {
    title: shorten(title, limits.title),
    accent: shorten(accent, limits.accent),
    body: shorten(body, limits.body),
  };
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeDurationSeconds(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
}

function resolveRequestedDurationSeconds(props: Record<string, unknown> | null | undefined): number | null {
  const runtime = parseJsonRecord(props?.runtime);
  return normalizeDurationSeconds(runtime.duration_seconds);
}

function extractStaticDurationSeconds(htmlDocument: string): number | null {
  const match = htmlDocument.match(/data-duration="([\d.]+)"/i);
  return normalizeDurationSeconds(match?.[1]);
}

function normalizeSnapshot(snapshot: ProviderLabPostSnapshot): ProviderLabPostSnapshot {
  return {
    ...snapshot,
    media: {
      ...snapshot.media,
      image_urls: Array.isArray(snapshot.media?.image_urls)
        ? snapshot.media.image_urls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [],
    },
  };
}

function buildSceneSchedule(snapshot: ProviderLabPostSnapshot) {
  const images = snapshot.media.image_urls;
  const introDuration = 2;
  const imageDuration = 3;
  const imageDurations = images.map((_url, index) => ({
    start: Number((introDuration + (index * imageDuration)).toFixed(2)),
    duration: imageDuration,
    url: images[index],
    index,
  }));
  const lastImageEnd = imageDurations.length > 0
    ? imageDurations[imageDurations.length - 1].start + imageDurations[imageDurations.length - 1].duration
    : introDuration;
  const outroStart = Number(lastImageEnd.toFixed(2));
  const outroDuration = 5;

  return {
    introDuration,
    imageScenes: imageDurations,
    outroStart,
    outroDuration,
    totalDuration: Number((outroStart + outroDuration).toFixed(2)),
  };
}

function buildBasicHtml(snapshotInput: ProviderLabPostSnapshot): string {
  const snapshot = normalizeSnapshot(snapshotInput);
  const copy = resolvePostCopy(snapshot, { title: 80, accent: 80, body: 180 });
  const title = escapeHtml(copy.title);
  const accent = escapeHtml(copy.accent);
  const body = escapeHtml(copy.body);
  const primaryColour = pickColor(snapshot.brand.primary_colour, '#235BAA');
  const logoUrl = snapshot.brand.logo_url ? escapeHtml(snapshot.brand.logo_url) : '';
  const { introDuration, imageScenes, outroStart, outroDuration, totalDuration } = buildSceneSchedule(snapshot);

  const imageNodes = imageScenes.map((scene) => {
    const safeUrl = escapeHtml(scene.url);
    return `
      <img
        id="scene-image-${scene.index}"
        class="clip scene-image"
        data-start="${scene.start}"
        data-duration="${scene.duration}"
        data-track-index="0"
        src="${safeUrl}"
      />
    `;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #09111f;
      }

      #root {
        position: relative;
        width: ${DEFAULT_WIDTH}px;
        height: ${DEFAULT_HEIGHT}px;
        overflow: hidden;
        background: #ffffff;
        color: #09111f;
        font-family: "Inter", "Roboto", sans-serif;
      }

      .clip {
        position: absolute;
      }

      #intro-card {
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
      }

      #intro-logo-wrap {
        width: 420px;
        height: 420px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #intro-logo-wrap img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .scene-image {
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #ffffff;
      }

      #outro-card {
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 120px 96px;
        box-sizing: border-box;
        background: #ffffff;
        text-align: center;
      }

      #outro-kicker {
        font-size: 24px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: ${primaryColour};
        margin-bottom: 22px;
      }

      #outro-title {
        max-width: 920px;
        font-size: 112px;
        line-height: 0.92;
        letter-spacing: -0.05em;
        font-weight: 800;
        color: #09111f;
        margin-bottom: 36px;
        text-wrap: balance;
      }

      #outro-body {
        max-width: 780px;
        font-size: 36px;
        line-height: 1.2;
        color: rgba(9, 17, 31, 0.78);
        margin-bottom: 36px;
      }

      #outro-logo {
        width: 180px;
        height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #outro-logo img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="provider-lab-main" data-start="0" data-duration="${totalDuration}" data-width="${DEFAULT_WIDTH}" data-height="${DEFAULT_HEIGHT}">
      ${logoUrl ? `
      <div
        id="intro-card"
        class="clip"
        data-start="0"
        data-duration="${introDuration}"
        data-track-index="0"
      >
        <div id="intro-logo-wrap">
          <img src="${logoUrl}" alt="" />
        </div>
      </div>` : ''}
      ${imageNodes}
      <div
        id="outro-card"
        class="clip"
        data-start="${outroStart}"
        data-duration="${outroDuration}"
        data-track-index="1"
      >
        ${accent ? `<div id="outro-kicker">${accent}</div>` : ''}
        ${title ? `<div id="outro-title">${title}</div>` : ''}
        ${body ? `<div id="outro-body">${body}</div>` : ''}
        ${logoUrl ? `<div id="outro-logo"><img src="${logoUrl}" alt="" /></div>` : ''}
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${logoUrl ? `
      tl.fromTo("#intro-logo-wrap", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out" }, 0.12);` : ''}
      ${imageScenes.map((scene) => {
        const start = Number(scene.start.toFixed(2));
        return `
      tl.fromTo("#scene-image-${scene.index}", { opacity: 0, scale: 1.03 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" }, ${start});
      tl.to("#scene-image-${scene.index}", { scale: 1.01, duration: ${scene.duration}, ease: "none" }, ${start});
      tl.to("#scene-image-${scene.index}", { opacity: 0, duration: 0.35, ease: "power2.inOut" }, ${Number((scene.start + scene.duration - 0.35).toFixed(2))});`;
      }).join('\n')}
      tl.fromTo("#outro-card", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, ${outroStart});
      tl.fromTo("#outro-title", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, ${Number((outroStart + 0.1).toFixed(2))});
      tl.fromTo("#outro-body", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.38, ease: "power2.out" }, ${Number((outroStart + 0.28).toFixed(2))});
      ${logoUrl ? `tl.fromTo("#outro-logo", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.38, ease: "power2.out" }, ${Number((outroStart + 0.38).toFixed(2))});` : ''}
      window.__timelines["provider-lab-main"] = tl;
    </script>
    <script>${HYPERFRAMES_HF_BRIDGE_SCRIPT}</script>
  </body>
</html>`;
}

function buildSplitPanelHtml(snapshotInput: ProviderLabPostSnapshot): string {
  const snapshot = normalizeSnapshot(snapshotInput);
  const copy = resolvePostCopy(snapshot, { title: 72, accent: 80, body: 150 });
  const title = escapeHtml(copy.title);
  const accent = escapeHtml(copy.accent);
  const body = escapeHtml(copy.body);
  const captionTitle = escapeHtml(copy.accent || copy.title);
  const captionBody = escapeHtml(copy.body || (copy.accent && copy.accent !== copy.title ? copy.accent : ''));
  const secondaryColour = pickColor(snapshot.brand.secondary_colour, '#4582D0');
  const logoUrl = snapshot.brand.logo_url ? escapeHtml(snapshot.brand.logo_url) : '';
  const { imageScenes, totalDuration } = buildSceneSchedule(snapshot);
  const cardScenes = imageScenes.slice(0, 4);

  const cardNodes = cardScenes.map((scene, index) => {
    const top = 110 + (index * 340);
    const rotate = index % 2 === 0 ? -3 : 3;
    return `
      <div
        id="card-${scene.index}"
        class="clip photo-card"
        data-start="${scene.start}"
        data-duration="${scene.duration + 0.85}"
        data-track-index="1"
        style="top:${top}px; right:${index % 2 === 0 ? 82 : 126}px; transform: rotate(${rotate}deg); z-index:${20 - index};"
      >
        <img src="${escapeHtml(scene.url)}" alt="${title}" />
      </div>
    `;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #050a12;
      }

      #root {
        position: relative;
        width: ${DEFAULT_WIDTH}px;
        height: ${DEFAULT_HEIGHT}px;
        overflow: hidden;
        background:
          radial-gradient(circle at top left, ${secondaryColour}33 0%, transparent 34%),
          linear-gradient(180deg, #07101d 0%, #0a1321 100%);
        color: #f5f8ff;
        font-family: "Inter", "Roboto", sans-serif;
      }

      .clip {
        position: absolute;
      }

      #left-panel {
        inset: 0 auto 0 0;
        width: 47%;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%),
          linear-gradient(180deg, #0c1625 0%, #07101b 100%);
        border-right: 1px solid rgba(255,255,255,0.08);
        padding: 82px 56px 74px 70px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
      }

      #eyebrow {
        font-size: 24px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(245,248,255,0.65);
        margin-bottom: 22px;
      }

      #headline {
        font-size: 98px;
        line-height: 0.93;
        letter-spacing: -0.05em;
        font-weight: 800;
        margin-bottom: 28px;
        text-wrap: balance;
      }

      #body-copy {
        font-size: 30px;
        line-height: 1.34;
        color: rgba(245,248,255,0.78);
        max-width: 360px;
        margin-top: auto;
      }

      .photo-card {
        width: 430px;
        height: 292px;
        border-radius: 34px;
        padding: 14px;
        box-sizing: border-box;
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.18);
        box-shadow: 0 28px 75px rgba(0,0,0,0.34);
        backdrop-filter: blur(14px);
        opacity: 0;
      }

      .photo-card img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 22px;
      }

      #logo-shell {
        bottom: 76px;
        right: 92px;
        width: 132px;
        height: 132px;
        border-radius: 34px;
        background: rgba(7, 17, 31, 0.54);
        border: 1px solid rgba(255,255,255,0.16);
        backdrop-filter: blur(12px);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #logo-shell img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 18px;
        box-sizing: border-box;
      }

      #caption-strip {
        left: 54%;
        right: 74px;
        bottom: 84px;
        padding: 28px 32px;
        border-radius: 30px;
        background: rgba(7, 17, 31, 0.72);
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 22px 65px rgba(0,0,0,0.26);
      }

      #caption-strip-title {
        font-size: 26px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(245,248,255,0.58);
        margin-bottom: 12px;
      }

      #caption-strip-body {
        font-size: 34px;
        line-height: 1.24;
        color: rgba(245,248,255,0.84);
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="provider-lab-main" data-start="0" data-duration="${totalDuration}" data-width="${DEFAULT_WIDTH}" data-height="${DEFAULT_HEIGHT}">
      <div id="left-panel" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="0">
        ${accent ? `<div id="eyebrow">${accent}</div>` : ''}
        ${title ? `<div id="headline">${title}</div>` : ''}
        ${body ? `<div id="body-copy">${body}</div>` : ''}
      </div>
      ${cardNodes}
      ${logoUrl ? `
      <div id="logo-shell" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
        <img src="${logoUrl}" alt="" />
      </div>` : ''}
      ${(captionTitle || captionBody) ? `
      <div id="caption-strip" class="clip" data-start="${Math.max(totalDuration - 1.55, 0.4).toFixed(2)}" data-duration="1.55" data-track-index="3">
        ${captionTitle ? `<div id="caption-strip-title">${captionTitle}</div>` : ''}
        ${captionBody ? `<div id="caption-strip-body">${captionBody}</div>` : ''}
      </div>` : ''}
    </div>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#left-panel", { opacity: 0, x: -28 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" }, 0.02);
      tl.fromTo("#headline", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, 0.12);
      tl.fromTo("#body-copy", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.42, ease: "power2.out" }, 0.32);
      ${cardScenes.map((scene, index) => {
        const start = Number(Math.max(scene.start - 0.04, 0.08).toFixed(2));
        const exit = Number(Math.max(scene.start + scene.duration + 0.18, start + 0.6).toFixed(2));
        return `
      tl.fromTo("#card-${scene.index}", { opacity: 0, x: 34, y: 12, scale: 0.96 }, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.42, ease: "power2.out" }, ${start});
      tl.to("#card-${scene.index}", { y: -12, duration: ${Number((scene.duration + 0.2).toFixed(2))}, ease: "none" }, ${start});
      ${index < cardScenes.length - 1 ? `tl.to("#card-${scene.index}", { opacity: 0.28, scale: 0.96, duration: 0.28, ease: "power2.inOut" }, ${exit});` : ''}`;
      }).join('\n')}
      ${logoUrl ? `
      tl.fromTo("#logo-shell", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }, 0.28);` : ''}
      tl.fromTo("#caption-strip", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.36, ease: "power2.out" }, ${Math.max(totalDuration - 1.45, 0.4).toFixed(2)});
      window.__timelines["provider-lab-main"] = tl;
    </script>
    <script>${HYPERFRAMES_HF_BRIDGE_SCRIPT}</script>
  </body>
</html>`;
}

function buildRecentJobLoopHtml(snapshotInput: ProviderLabPostSnapshot): string {
  const snapshot = normalizeSnapshot(snapshotInput);
  const images = snapshot.media.image_urls;
  const primaryColour = pickColor(snapshot.brand.primary_colour, '#2563EB');
  const logoUrl = snapshot.brand.logo_url ? escapeHtml(snapshot.brand.logo_url) : '';
  const companyName = escapeHtml(shorten(snapshot.brand.company_name, 40));
  const categoryName = escapeHtml(shorten(snapshot.post.category_name, 36) || 'Home Services');
  const jobTitle = escapeHtml(shorten(
    snapshot.content.title || snapshot.content.subtitle || snapshot.content.body,
    72,
  ) || 'Recent Job');

  const INTRO_DUR = 2.5;
  const PHOTO_DUR = 3.0;
  const OUTRO_DUR = 2.5;
  const outroStart = Number((INTRO_DUR + images.length * PHOTO_DUR).toFixed(2));
  const totalDuration = Number((outroStart + OUTRO_DUR).toFixed(2));

  const photoNodes = images.map((url, i) => {
    const start = Number((INTRO_DUR + i * PHOTO_DUR).toFixed(2));
    return `
    <div id="ps${i}" class="clip ps" data-start="${start}" data-duration="${PHOTO_DUR}" data-track-index="1">
      <img src="${escapeHtml(url)}" alt="" />
      <div class="po">
        <div class="po-badge" style="color:${primaryColour};border-color:${primaryColour}44;background:${primaryColour}18">${categoryName}</div>
        <div class="po-title">${jobTitle}</div>
        <div class="po-company">${companyName}</div>
      </div>
    </div>`;
  }).join('\n');

  const photoTimeline = images.map((_, i) => {
    const start = Number((INTRO_DUR + i * PHOTO_DUR).toFixed(2));
    const fadeOut = Number((start + PHOTO_DUR - 0.45).toFixed(2));
    const isLast = i === images.length - 1;
    return `
      tl.to("#ps${i}", {opacity:1,duration:0.48,ease:"power2.out"}, ${start});
      tl.fromTo("#ps${i} img", {scale:1.0}, {scale:1.04,duration:${PHOTO_DUR},ease:"none"}, ${start});
      tl.fromTo("#ps${i} .po-badge", {opacity:0,y:14}, {opacity:1,y:0,duration:0.38,ease:"power2.out"}, ${Number((start + 0.28).toFixed(2))});
      tl.fromTo("#ps${i} .po-title", {opacity:0,y:22}, {opacity:1,y:0,duration:0.45,ease:"power2.out"}, ${Number((start + 0.44).toFixed(2))});
      tl.fromTo("#ps${i} .po-company", {opacity:0,y:12}, {opacity:1,y:0,duration:0.36,ease:"power2.out"}, ${Number((start + 0.62).toFixed(2))});
      tl.to("#ps${i}", {opacity:0,duration:${isLast ? 0.55 : 0.38},ease:"power2.inOut"}, ${fadeOut});`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" />
    <style>
      html, body { margin:0; width:100%; height:100%; overflow:hidden; background:#050d18; }
      #root {
        position:relative; width:${DEFAULT_WIDTH}px; height:${DEFAULT_HEIGHT}px;
        overflow:hidden; background:#0b1322;
        font-family:'Inter','Roboto',sans-serif; color:#f0f4ff;
      }
      .clip { position:absolute; inset:0; opacity:0; }

      /* ── INTRO ── */
      #intro-bg { position:absolute; inset:0; background:linear-gradient(180deg,#0d1a2e 0%,#0b1322 100%); }
      #intro-ring1 {
        position:absolute; top:320px; left:50%; transform:translateX(-50%);
        width:560px; height:560px; border-radius:50%;
        border:1px solid ${primaryColour}28;
        background:radial-gradient(circle,${primaryColour}16 0%,transparent 65%);
      }
      #intro-ring2 {
        position:absolute; top:180px; left:50%; transform:translateX(-50%);
        width:840px; height:840px; border-radius:50%;
        border:1px solid ${primaryColour}14;
      }
      #intro-logo-shell {
        position:absolute; top:480px; left:50%; transform:translateX(-50%);
        width:180px; height:180px; border-radius:36px;
        background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.14);
        display:flex; align-items:center; justify-content:center; overflow:hidden;
      }
      #intro-logo-shell img { width:78%; height:78%; object-fit:contain; }
      #intro-text-area {
        position:absolute; bottom:120px; left:80px; right:80px;
        display:flex; flex-direction:column; gap:20px;
      }
      #intro-badge {
        font-size:24px; font-weight:800; letter-spacing:0.22em; text-transform:uppercase;
        padding:12px 32px; border-radius:100px; border:2px solid ${primaryColour};
        color:${primaryColour}; display:inline-block; align-self:flex-start;
      }
      #intro-service {
        font-size:96px; font-weight:800; line-height:0.93; letter-spacing:-0.04em;
        text-wrap:balance;
      }
      #intro-company {
        font-size:30px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase;
        color:rgba(240,244,255,0.48);
      }
      #intro-bar { position:absolute; bottom:0; left:0; width:100%; height:10px; background:${primaryColour}; }

      /* ── PHOTOS ── */
      .ps img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .po {
        position:absolute; bottom:0; left:0; right:0;
        padding:220px 80px 110px;
        background:linear-gradient(to top,rgba(11,19,34,0.92) 0%,rgba(11,19,34,0.44) 55%,transparent 100%);
        display:flex; flex-direction:column; gap:18px;
      }
      .po-badge {
        font-size:22px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
        padding:10px 26px; border-radius:100px; border:1px solid; backdrop-filter:blur(8px);
        display:inline-block; align-self:flex-start;
      }
      .po-title {
        font-size:76px; font-weight:800; line-height:1.0; letter-spacing:-0.03em; text-wrap:balance;
      }
      .po-company {
        font-size:30px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase;
        color:rgba(240,244,255,0.62);
      }

      /* ── OUTRO ── */
      #outro-bg {
        position:absolute; inset:0;
        background:linear-gradient(180deg,#0d1a2e 0%,#0b1322 100%);
      }
      #outro-glow {
        position:absolute; top:820px; left:50%; transform:translateX(-50%);
        width:900px; height:900px; border-radius:50%;
        background:radial-gradient(circle,${primaryColour}1c 0%,transparent 65%);
        pointer-events:none;
      }
      #outro-logo-shell {
        position:absolute; top:260px; left:80px;
        width:140px; height:140px; border-radius:28px;
        background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.13);
        display:flex; align-items:center; justify-content:center; overflow:hidden;
      }
      #outro-logo-shell img { width:78%; height:78%; object-fit:contain; }
      #outro-text-area {
        position:absolute; top:1060px; left:80px; right:80px;
        display:flex; flex-direction:column; gap:24px;
      }
      #outro-eyebrow {
        font-size:26px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase;
        color:rgba(240,244,255,0.44);
      }
      #outro-company {
        font-size:112px; font-weight:800; line-height:0.91; letter-spacing:-0.04em;
        text-wrap:balance; color:${primaryColour};
      }
      #outro-bar { position:absolute; bottom:0; left:0; width:100%; height:10px; background:${primaryColour}; }
    </style>
  </head>
  <body>
    <div id="root"
         data-composition-id="recent-job-hs-loop"
         data-start="0"
         data-duration="${totalDuration}"
         data-width="${DEFAULT_WIDTH}"
         data-height="${DEFAULT_HEIGHT}">

      <div id="intro-card" class="clip" data-start="0" data-duration="${INTRO_DUR}" data-track-index="0">
        <div id="intro-bg"></div>
        <div id="intro-ring1"></div>
        <div id="intro-ring2"></div>
        ${logoUrl ? `<div id="intro-logo-shell"><img src="${logoUrl}" alt="" /></div>` : ''}
        <div id="intro-text-area">
          <div id="intro-badge">Recent Job</div>
          <div id="intro-service">${categoryName}</div>
          ${companyName ? `<div id="intro-company">${companyName}</div>` : ''}
        </div>
        <div id="intro-bar"></div>
      </div>

      ${photoNodes}

      <div id="outro-card" class="clip" data-start="${outroStart}" data-duration="${OUTRO_DUR}" data-track-index="2">
        <div id="outro-bg"></div>
        <div id="outro-glow"></div>
        ${logoUrl ? `<div id="outro-logo-shell"><img src="${logoUrl}" alt="" /></div>` : ''}
        <div id="outro-text-area">
          <div id="outro-eyebrow">Quality You Can See</div>
          ${companyName ? `<div id="outro-company">${companyName}</div>` : ''}
        </div>
        <div id="outro-bar"></div>
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      // INTRO
      tl.to("#intro-card", {opacity:1,duration:0.5,ease:"power2.out"}, 0);
      tl.fromTo("#intro-ring1", {opacity:0,scale:0.8}, {opacity:1,scale:1,duration:0.7,ease:"power2.out"}, 0.05);
      tl.fromTo("#intro-ring2", {opacity:0,scale:0.84}, {opacity:1,scale:1,duration:0.8,ease:"power2.out"}, 0.1);
      ${logoUrl ? `tl.fromTo("#intro-logo-shell", {opacity:0,scale:0.88}, {opacity:1,scale:1,duration:0.44,ease:"back.out(1.4)"}, 0.14);` : ''}
      tl.fromTo("#intro-badge", {opacity:0,x:-16}, {opacity:1,x:0,duration:0.4,ease:"power2.out"}, 0.22);
      tl.fromTo("#intro-service", {opacity:0,y:26}, {opacity:1,y:0,duration:0.5,ease:"power2.out"}, 0.36);
      tl.fromTo("#intro-company", {opacity:0,y:14}, {opacity:1,y:0,duration:0.38,ease:"power2.out"}, 0.56);
      tl.to("#intro-card", {opacity:0,duration:0.4,ease:"power2.inOut"}, ${INTRO_DUR - 0.4});

      // PHOTOS
      ${photoTimeline}

      // OUTRO
      tl.to("#outro-card", {opacity:1,duration:0.52,ease:"power2.out"}, ${outroStart});
      tl.fromTo("#outro-glow", {opacity:0,scale:0.7}, {opacity:1,scale:1,duration:0.8,ease:"power2.out"}, ${Number((outroStart + 0.04).toFixed(2))});
      ${logoUrl ? `tl.fromTo("#outro-logo-shell", {opacity:0,x:-12}, {opacity:1,x:0,duration:0.38,ease:"power2.out"}, ${Number((outroStart + 0.16).toFixed(2))});` : ''}
      tl.fromTo("#outro-eyebrow", {opacity:0,y:14}, {opacity:1,y:0,duration:0.38,ease:"power2.out"}, ${Number((outroStart + 0.22).toFixed(2))});
      tl.fromTo("#outro-company", {opacity:0,y:28}, {opacity:1,y:0,duration:0.52,ease:"power2.out"}, ${Number((outroStart + 0.36).toFixed(2))});
      tl.to("#outro-card", {opacity:0,duration:0.4,ease:"power2.inOut"}, ${Number((totalDuration - 0.4).toFixed(2))});

      window.__timelines["recent-job-hs-loop"] = tl;
    </script>
    <script>${HYPERFRAMES_HF_BRIDGE_SCRIPT}</script>
  </body>
</html>`;
}

function buildHtml(snapshotInput: ProviderLabPostSnapshot, templateId: string): string {
  if (templateId === SPLIT_TEMPLATE_ID) {
    return buildSplitPanelHtml(snapshotInput);
  }
  if (templateId === RECENT_JOB_LOOP_TEMPLATE_ID) {
    return buildRecentJobLoopHtml(snapshotInput);
  }
  return buildBasicHtml(snapshotInput);
}

async function capturePosterFrame(videoPath: string, atSeconds: number): Promise<Buffer> {
  const posterPath = path.join(path.dirname(videoPath), 'poster.png');

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions([`-ss ${Math.max(0, atSeconds).toFixed(2)}`])
      .outputOptions(['-frames:v 1'])
      .output(posterPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });

  return fs.readFileSync(posterPath);
}

function resolveHyperframesCliPath() {
  if (process.env.HYPERFRAMES_CLI_PATH?.trim()) {
    return process.env.HYPERFRAMES_CLI_PATH.trim();
  }
  const localBin = path.resolve(process.cwd(), 'node_modules/.bin/hyperframes');
  return fs.existsSync(localBin) ? localBin : 'hyperframes';
}

function isRailwayRuntime() {
  return Boolean(process.env.RAILWAY_ENVIRONMENT)
    || Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);
}

function isCloudflareContainerRuntime() {
  return process.env.CONTAINER === 'true' && !isRailwayRuntime();
}

function isContainerizedHyperframesRuntime() {
  return isRailwayRuntime() || isCloudflareContainerRuntime();
}

type HyperframesRuntimeLabel = 'cloudflare' | 'railway' | 'local';

function resolveHyperframesRuntimeLabel(): HyperframesRuntimeLabel {
  if (isRailwayRuntime()) return 'railway';
  if (isCloudflareContainerRuntime()) return 'cloudflare';
  return 'local';
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveHyperframesWorkerCount() {
  const runtime = resolveHyperframesRuntimeLabel();

  const runtimeSpecificRaw = runtime === 'cloudflare'
    ? process.env.HYPERFRAMES_RENDER_WORKERS_CLOUDFLARE
    : runtime === 'railway'
      ? process.env.HYPERFRAMES_RENDER_WORKERS_RAILWAY
      : undefined;

  const runtimeSpecific = parsePositiveInt(runtimeSpecificRaw);
  if (runtimeSpecific) return runtimeSpecific;
  if (runtimeSpecificRaw && runtimeSpecificRaw.trim()) {
    console.warn(`[hyperframes] ignoring invalid ${runtime} worker override: ${runtimeSpecificRaw}`);
  }

  const globalRaw = process.env.HYPERFRAMES_RENDER_WORKERS?.trim()
    || process.env.PRODUCER_MAX_WORKERS?.trim();
  const globalParsed = parsePositiveInt(globalRaw);
  if (globalParsed) return globalParsed;
  if (globalRaw) {
    console.warn(`[hyperframes] ignoring invalid worker override: ${globalRaw}`);
  }

  // Containerised hosts (Railway, and Cloudflare by default) start at a
  // single worker. Railway enforces a tight PID budget where auto-scaling
  // the CLI to 6 workers exhausts Chromium thread/process creation inside
  // a single request. Cloudflare Containers have not yet been benchmarked,
  // so we default conservatively and expose HYPERFRAMES_RENDER_WORKERS_CLOUDFLARE
  // to tune without touching Railway.
  return isContainerizedHyperframesRuntime() ? 1 : null;
}

async function runHyperframesCliRender(input: {
  projectDir: string;
  outputPath: string;
  mode: 'preview' | 'final';
}) {
  const cliPath = resolveHyperframesCliPath();
  const quality = input.mode === 'preview' ? 'draft' : 'standard';
  const workerCount = resolveHyperframesWorkerCount();
  const runtime = resolveHyperframesRuntimeLabel();
  console.log(
    `[hyperframes] cli render starting runtime=${runtime} workers=${workerCount ?? 'auto'} mode=${input.mode} quality=${quality}`,
  );
  const args = [
    'render',
    input.projectDir,
    '--output',
    input.outputPath,
    '--fps',
    String(DEFAULT_FPS),
    '--quality',
    quality,
    '--quiet',
  ];
  if (workerCount) {
    args.push('--workers', String(workerCount));
  }

  await new Promise<void>((resolve, reject) => {
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CI: process.env.CI || '1',
      // HeadlessExperimental.beginFrame on the Linux render host can emit
      // intermittent black frames for otherwise-correct Hyperframes seeks.
      // Force the CLI onto the stable screenshot capture path for this provider.
      PRODUCER_FORCE_SCREENSHOT: 'true',
    };

    if (workerCount) {
      childEnv.PRODUCER_MAX_WORKERS = String(workerCount);
    }

    // In Railway/Docker we also have full Chromium available. Prefer that
    // browser over chrome-headless-shell for screenshot-mode captures, since
    // the black-frame artifact is production-only and does not reproduce with
    // normal browser screenshots locally.
    if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) {
      childEnv.PRODUCER_HEADLESS_SHELL_PATH = process.env.PUPPETEER_EXECUTABLE_PATH.trim();
    }

    const cli = spawn(cliPath, args, {
      cwd: input.projectDir,
      env: childEnv,
    });

    let output = '';
    cli.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    cli.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    cli.on('error', reject);
    cli.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`hyperframes render failed with exit ${code}: ${output.trim()}`));
    });
  });
}

async function renderHyperframesHtmlDocument(input: {
  htmlDocument: string;
  mode: 'preview' | 'final';
  durationMs: number | null;
}): Promise<ProviderRenderArtifacts> {
  if (renderOverride) {
    return renderOverride({
      htmlDocument: input.htmlDocument,
      mode: input.mode,
    });
  }

  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-lab-hyperframes-'));
  const outputPath = path.join(projectDir, 'render.mp4');
  const htmlPath = path.join(projectDir, 'index.html');
  fs.writeFileSync(htmlPath, input.htmlDocument, 'utf8');

  const timings = {
    cliMs: 0,
    verifyMs: 0,
    posterMs: 0,
    totalMs: 0,
    workerCount: resolveHyperframesWorkerCount(),
    runtime: resolveHyperframesRuntimeLabel(),
  };
  const overallStart = Date.now();
  try {
    const cliStart = Date.now();
    await runHyperframesCliRender({
      projectDir,
      outputPath,
      mode: input.mode,
    });
    timings.cliMs = Date.now() - cliStart;
    const shouldVerify = input.mode === 'final' || process.env.HYPERFRAMES_VERIFY_PREVIEW === 'true';
    const verifyStart = Date.now();
    const verification = shouldVerify
      ? await scanVideoForHyperframesFrameIssues(outputPath)
      : null;
    timings.verifyMs = shouldVerify ? Date.now() - verifyStart : 0;
    if (verification?.failed) {
      throw new Error(`Hyperframes frame gate failed: ${verification.summary}`);
    }
    if (verification && verification.darkFrames.length > 0) {
      console.warn(`[hyperframes frame gate] dark-frame warning: ${verification.summary}`);
    }
    const mp4Buffer = fs.readFileSync(outputPath);
    const durationSeconds = input.durationMs ? input.durationMs / 1000 : 0;
    const posterSeconds = durationSeconds > 0
      ? Math.min(Math.max(durationSeconds * 0.2, 0.5), durationSeconds)
      : 0.5;
    const posterStart = Date.now();
    const posterBuffer = await capturePosterFrame(outputPath, posterSeconds);
    timings.posterMs = Date.now() - posterStart;
    timings.totalMs = Date.now() - overallStart;
    console.log(
      `[hyperframes timing] runtime=${resolveHyperframesRuntimeLabel()} mode=${input.mode} cliMs=${timings.cliMs} verifyMs=${timings.verifyMs} posterMs=${timings.posterMs} totalMs=${timings.totalMs}`,
    );

    return {
      templateId: HYPERFRAMES_TEMPLATE_ID,
      mp4Buffer,
      posterBuffer,
      durationMs: input.durationMs || Math.round((durationSeconds || extractStaticDurationSeconds(input.htmlDocument) || 0) * 1000),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      verificationSummary: verification?.summary,
      timings,
    };
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

function injectRootDataDuration(html: string, seconds: number): string {
  if (!(seconds > 0)) return html;
  if (/data-composition-id=[^>]*data-duration=/i.test(html)) return html;
  return html.replace(
    /(<[^>]*\sdata-composition-id=["'][^"']+["'][^>]*)(>)/i,
    (match, open, close) => {
      if (/data-duration=/i.test(open)) return match;
      return `${open} data-duration="${seconds}"${close}`;
    },
  );
}

export function buildHyperframesCompositionDocument(input: Omit<HyperframesCompositionRenderInput, 'mode'>): string {
  const props = input.props || {};
  const assets = input.assets || {};
  const slotConstraints = input.slotConstraints || {};
  const requestedSeconds = resolveRequestedDurationSeconds(props) ?? 0;
  const compositionHtml = injectRootDataDuration(String(input.compositionHtml || ''), requestedSeconds);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>${String(input.compositionCss || '')}</style>
  </head>
  <body>
    ${compositionHtml}
    <script>
      window.__HYPERFRAMES_PROPS__ = ${JSON.stringify(props)};
      window.__HYPERFRAMES_ASSETS__ = ${JSON.stringify(assets)};
      window.__HYPERFRAMES_SLOT_CONSTRAINTS__ = ${JSON.stringify(slotConstraints)};
      window.__HYPERFRAMES_DURATION_SECONDS__ = ${requestedSeconds > 0 ? requestedSeconds : 0};
      window.__timelines = window.__timelines || {};
    </script>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>${escapeScriptText(String(input.compositionJs || ''))}</script>
    <script>${HYPERFRAMES_HF_BRIDGE_SCRIPT}</script>
  </body>
</html>`;
}

export async function renderHyperframesComposition(
  input: HyperframesCompositionRenderInput,
): Promise<ProviderRenderArtifacts> {
  const htmlDocument = buildHyperframesCompositionDocument(input);
  const durationMs = (() => {
    const seconds = resolveRequestedDurationSeconds(input.props || null);
    return seconds ? Math.round(seconds * 1000) : null;
  })();

  return renderHyperframesHtmlDocument({
    htmlDocument,
    mode: input.mode,
    durationMs,
  });
}

function resolveTemplateId(templateId: string): string {
  return HYPERFRAMES_TEMPLATES.some((t) => t.id === templateId)
    ? templateId
    : BASIC_TEMPLATE_ID;
}

async function createProject(
  snapshot: ProviderLabPostSnapshot,
  templateId: string,
): Promise<{ htmlDocument: string; durationMs: number; templateId: string }> {
  const normalized = normalizeSnapshot(snapshot);
  const { totalDuration } = buildSceneSchedule(normalized);
  const resolvedTemplateId = resolveTemplateId(templateId);

  return {
    htmlDocument: buildHtml(normalized, resolvedTemplateId),
    durationMs: Math.round(totalDuration * 1000),
    templateId: resolvedTemplateId,
  };
}

export function setHyperframesRenderOverrideForTests(nextOverride: HyperframesRenderOverride | null) {
  renderOverride = nextOverride;
}

export const hyperframesProvider: ProviderExperimentProvider = {
  id: PROVIDER_ID,
  label: 'Hyperframes',
  templates: HYPERFRAMES_TEMPLATES,
  async render({ snapshot, mode, templateId }): Promise<ProviderRenderArtifacts> {
    const { htmlDocument, durationMs, templateId: resolvedTemplateId } = await createProject(snapshot, templateId);
    const artifacts = await renderHyperframesHtmlDocument({
      htmlDocument,
      mode,
      durationMs,
    });
    return {
      ...artifacts,
      templateId: resolvedTemplateId,
    };
  },
};

export const HYPERFRAMES_TEMPLATE_ID = BASIC_TEMPLATE_ID;
