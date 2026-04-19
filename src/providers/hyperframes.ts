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

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 30;
const PROVIDER_ID = 'hyperframes';
const BASIC_TEMPLATE_ID = 'hyperframes-basic-v1';
const SPLIT_TEMPLATE_ID = 'hyperframes-split-panel-v1';

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
  window.__hf = {
    get duration(){
      var tls = timelines();
      var max = 0;
      for (var i = 0; i < tls.length; i++) {
        var d = timelineDuration(tls[i]);
        if (d > max) max = d;
      }
      return max > 0 ? max : declaredDuration();
    },
    seek: function(t){
      var tls = timelines();
      for (var i = 0; i < tls.length; i++) {
        var tl = tls[i];
        if (!tl) continue;
        try { if (typeof tl.pause === 'function') tl.pause(); } catch(_) {}
        try {
          if (typeof tl.seek === 'function') tl.seek(t, false);
          else if (typeof tl.time === 'function') tl.time(t);
        } catch(_) {}
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
  const title = escapeHtml(shorten(snapshot.content.title || snapshot.brand.company_name || 'Provider Lab Reel', 80));
  const subtitle = escapeHtml(shorten(snapshot.content.subtitle || snapshot.post.category_name || 'Real post snapshot', 80));
  const body = escapeHtml(shorten(snapshot.content.body || 'Provider experiment render using a real Local Pros post snapshot.', 180));
  const companyName = escapeHtml(shorten(snapshot.brand.company_name || 'Local Pros', 60));
  const platforms = escapeHtml((snapshot.platform_context.platforms || []).join(' • ') || 'Social Reel');
  const primaryColour = pickColor(snapshot.brand.primary_colour, '#235BAA');
  const secondaryColour = pickColor(snapshot.brand.secondary_colour, '#4582D0');
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

      #outro-company {
        margin-top: 22px;
        font-size: 30px;
        font-weight: 600;
        color: ${secondaryColour};
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
          <img src="${logoUrl}" alt="${companyName}" />
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
        <div id="outro-kicker">${platforms}</div>
        <div id="outro-title">${title}</div>
        ${logoUrl ? `<div id="outro-logo"><img src="${logoUrl}" alt="${companyName}" /></div>` : ''}
        <div id="outro-company">${companyName}</div>
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
      ${logoUrl ? `tl.fromTo("#outro-logo", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.38, ease: "power2.out" }, ${Number((outroStart + 0.38).toFixed(2))});` : ''}
      tl.fromTo("#outro-company", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" }, ${Number((outroStart + 0.52).toFixed(2))});
      window.__timelines["provider-lab-main"] = tl;
    </script>
    <script>${HYPERFRAMES_HF_BRIDGE_SCRIPT}</script>
  </body>
</html>`;
}

function buildSplitPanelHtml(snapshotInput: ProviderLabPostSnapshot): string {
  const snapshot = normalizeSnapshot(snapshotInput);
  const title = escapeHtml(shorten(snapshot.content.title || snapshot.brand.company_name || 'Provider Lab Reel', 72));
  const subtitle = escapeHtml(shorten(snapshot.content.subtitle || snapshot.post.category_name || 'Real post snapshot', 80));
  const body = escapeHtml(shorten(snapshot.content.body || 'Provider experiment render using a real Local Pros post snapshot.', 150));
  const companyName = escapeHtml(shorten(snapshot.brand.company_name || 'Local Pros', 60));
  const primaryColour = pickColor(snapshot.brand.primary_colour, '#235BAA');
  const secondaryColour = pickColor(snapshot.brand.secondary_colour, '#4582D0');
  const logoUrl = snapshot.brand.logo_url ? escapeHtml(snapshot.brand.logo_url) : '';
  const platforms = escapeHtml((snapshot.platform_context.platforms || []).join(' • ') || 'Social Reel');
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
        margin-bottom: 20px;
        text-wrap: balance;
      }

      #subtitle {
        font-size: 38px;
        line-height: 1.18;
        color: rgba(245,248,255,0.8);
        margin-bottom: 28px;
      }

      #body-copy {
        font-size: 30px;
        line-height: 1.34;
        color: rgba(245,248,255,0.78);
        max-width: 360px;
      }

      #platform-chip {
        margin-top: auto;
        display: inline-flex;
        align-items: center;
        gap: 14px;
        padding: 18px 24px;
        border-radius: 999px;
        background: linear-gradient(90deg, ${primaryColour}, ${secondaryColour});
        font-size: 24px;
        font-weight: 700;
        align-self: flex-start;
      }

      #platform-chip::before {
        content: "";
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: rgba(255,255,255,0.86);
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
        <div id="eyebrow">${companyName}</div>
        <div id="headline">${title}</div>
        <div id="subtitle">${subtitle}</div>
        <div id="body-copy">${body}</div>
        <div id="platform-chip">${platforms}</div>
      </div>
      ${cardNodes}
      ${logoUrl ? `
      <div id="logo-shell" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
        <img src="${logoUrl}" alt="${companyName}" />
      </div>` : ''}
      <div id="caption-strip" class="clip" data-start="${Math.max(totalDuration - 1.55, 0.4).toFixed(2)}" data-duration="1.55" data-track-index="3">
        <div id="caption-strip-title">${companyName}</div>
        <div id="caption-strip-body">${body}</div>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#left-panel", { opacity: 0, x: -28 }, { opacity: 1, x: 0, duration: 0.5, ease: "power2.out" }, 0.02);
      tl.fromTo("#headline", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, 0.12);
      tl.fromTo("#subtitle", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, 0.22);
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

function buildHtml(snapshotInput: ProviderLabPostSnapshot, templateId: string): string {
  if (templateId === SPLIT_TEMPLATE_ID) {
    return buildSplitPanelHtml(snapshotInput);
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

async function runHyperframesCliRender(input: {
  projectDir: string;
  outputPath: string;
  mode: 'preview' | 'final';
}) {
  const cliPath = resolveHyperframesCliPath();
  const quality = input.mode === 'preview' ? 'draft' : 'standard';
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

  await new Promise<void>((resolve, reject) => {
    const cli = spawn(cliPath, args, {
      cwd: input.projectDir,
      env: {
        ...process.env,
        CI: process.env.CI || '1',
      },
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

  try {
    await runHyperframesCliRender({
      projectDir,
      outputPath,
      mode: input.mode,
    });
    const mp4Buffer = fs.readFileSync(outputPath);
    const durationSeconds = input.durationMs ? input.durationMs / 1000 : 0;
    const posterSeconds = durationSeconds > 0
      ? Math.min(Math.max(durationSeconds * 0.2, 0.5), durationSeconds)
      : 0.5;
    const posterBuffer = await capturePosterFrame(outputPath, posterSeconds);

    return {
      templateId: HYPERFRAMES_TEMPLATE_ID,
      mp4Buffer,
      posterBuffer,
      durationMs: input.durationMs || Math.round((durationSeconds || extractStaticDurationSeconds(input.htmlDocument) || 0) * 1000),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

export function buildHyperframesCompositionDocument(input: Omit<HyperframesCompositionRenderInput, 'mode'>): string {
  const props = input.props || {};
  const assets = input.assets || {};
  const slotConstraints = input.slotConstraints || {};

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>${String(input.compositionCss || '')}</style>
  </head>
  <body>
    ${String(input.compositionHtml || '')}
    <script>
      window.__HYPERFRAMES_PROPS__ = ${JSON.stringify(props)};
      window.__HYPERFRAMES_ASSETS__ = ${JSON.stringify(assets)};
      window.__HYPERFRAMES_SLOT_CONSTRAINTS__ = ${JSON.stringify(slotConstraints)};
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
  return HYPERFRAMES_TEMPLATES.some((template) => template.id === templateId)
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
