import { GoogleGenAI, createPartFromUri, createUserContent, FileState } from '@google/genai';
import { z } from 'zod';
import { config } from '../config.js';
import { templateSchema } from '../templates/schema.js';
import type {
  CompareAndIterateResponse,
  FrameDefinition,
  IterationHistoryEntry,
  ReferenceVideoAnalysis,
  ReferenceVideoSceneAnalysis,
  TemplateDefinition,
  VideoCompareIterateResponse,
} from '../types.js';

const referenceVideoAnalysisSchema = z.object({
  orientation: z.enum(['portrait', 'landscape', 'square']),
  aspectRatio: z.string().min(1),
  durationBucket: z.enum(['very_short', 'short', 'medium', 'long']),
  pacing: z.enum(['slow', 'steady', 'fast', 'punchy']),
  majorSceneCount: z.number().int().min(2).max(8),
  headlineTextDensity: z.enum(['none', 'light', 'medium', 'heavy']),
  overlayTreatment: z.enum(['minimal', 'dark_panel', 'light_panel', 'gradient_scrim', 'brand_blocks']),
  ctaTreatment: z.enum(['none', 'phone_banner', 'button_end_card', 'logo_end_card', 'text_only']),
  colorDirection: z.object({
    mood: z.string().min(1),
    dominantHex: z.string().min(1),
    secondaryHex: z.string().min(1),
    accentHex: z.string().min(1),
    contrast: z.enum(['low', 'medium', 'high']),
  }),
  slideshowBlueprint: z.object({
    recommendedFrameCount: z.number().int().min(2).max(8),
    transition: z.enum(['fade', 'slide_left', 'slide_right', 'zoom', 'crossfade']),
    openingStyle: z.string().min(1),
    closingStyle: z.string().min(1),
  }),
  scenes: z.array(z.object({
    order: z.number().int().min(1).max(8),
    role: z.enum(['hook', 'problem', 'proof', 'detail', 'offer', 'cta', 'brand']),
    visualStyle: z.enum(['full_bleed_image', 'split_image', 'text_panel', 'logo_end_card']),
    overlayPlacement: z.enum(['top', 'center', 'bottom', 'full']),
    textAmount: z.enum(['none', 'light', 'medium', 'heavy']),
    focus: z.string().min(1),
  })).min(2).max(8),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()).max(6).optional(),
});

const referenceVideoJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'orientation',
    'aspectRatio',
    'durationBucket',
    'pacing',
    'majorSceneCount',
    'headlineTextDensity',
    'overlayTreatment',
    'ctaTreatment',
    'colorDirection',
    'slideshowBlueprint',
    'scenes',
    'confidence',
  ],
  properties: {
    orientation: { type: 'string', enum: ['portrait', 'landscape', 'square'] },
    aspectRatio: { type: 'string' },
    durationBucket: { type: 'string', enum: ['very_short', 'short', 'medium', 'long'] },
    pacing: { type: 'string', enum: ['slow', 'steady', 'fast', 'punchy'] },
    majorSceneCount: { type: 'integer', minimum: 2, maximum: 8 },
    headlineTextDensity: { type: 'string', enum: ['none', 'light', 'medium', 'heavy'] },
    overlayTreatment: { type: 'string', enum: ['minimal', 'dark_panel', 'light_panel', 'gradient_scrim', 'brand_blocks'] },
    ctaTreatment: { type: 'string', enum: ['none', 'phone_banner', 'button_end_card', 'logo_end_card', 'text_only'] },
    colorDirection: {
      type: 'object',
      additionalProperties: false,
      required: ['mood', 'dominantHex', 'secondaryHex', 'accentHex', 'contrast'],
      properties: {
        mood: { type: 'string' },
        dominantHex: { type: 'string' },
        secondaryHex: { type: 'string' },
        accentHex: { type: 'string' },
        contrast: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    slideshowBlueprint: {
      type: 'object',
      additionalProperties: false,
      required: ['recommendedFrameCount', 'transition', 'openingStyle', 'closingStyle'],
      properties: {
        recommendedFrameCount: { type: 'integer', minimum: 2, maximum: 8 },
        transition: { type: 'string', enum: ['fade', 'slide_left', 'slide_right', 'zoom', 'crossfade'] },
        openingStyle: { type: 'string' },
        closingStyle: { type: 'string' },
      },
    },
    scenes: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['order', 'role', 'visualStyle', 'overlayPlacement', 'textAmount', 'focus'],
        properties: {
          order: { type: 'integer', minimum: 1, maximum: 8 },
          role: { type: 'string', enum: ['hook', 'problem', 'proof', 'detail', 'offer', 'cta', 'brand'] },
          visualStyle: { type: 'string', enum: ['full_bleed_image', 'split_image', 'text_panel', 'logo_end_card'] },
          overlayPlacement: { type: 'string', enum: ['top', 'center', 'bottom', 'full'] },
          textAmount: { type: 'string', enum: ['none', 'light', 'medium', 'heavy'] },
          focus: { type: 'string' },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    notes: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 6,
    },
  },
} as const;

const ANALYSIS_PROMPT = `Analyze this reference video as inspiration for a service-business slideshow reel template.

Important constraints:
- We only support slideshow-style MP4 templates built from still-image frames and static overlays.
- Do not attempt exact recreation, motion cloning, caption timing, audio extraction, or frame-by-frame copying.
- Focus on reusable structure: scene sequencing, pacing, overlay style, text density, CTA treatment, and overall aesthetic direction.
- Infer conservatively when details are unclear and use the notes field for caveats.

Return only structured JSON matching the provided schema.`;

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 90_000;

let client: GoogleGenAI | null = null;

export interface GenerateTemplateFromReferenceVideoInput {
  video: Blob;
  mimeType: string;
  displayName?: string;
  prompt?: string;
}

export interface GenerateTemplateFromReferenceVideoResult {
  analysis: ReferenceVideoAnalysis;
  template: TemplateDefinition;
}

export interface CompareAndIterateReferenceVideoInput extends GenerateTemplateFromReferenceVideoInput {
  generatedPreviewVideoUrl?: string;
  generatedPreviewPosterDataUri?: string;
  existingTemplate: TemplateDefinition;
  iterationHistory?: IterationHistoryEntry[];
  iterationNumber?: number;
  maxIterations?: number;
  feedback?: string;
  currentAnalysis?: ReferenceVideoAnalysis;
}

type GenerateReferenceVideoTemplateImpl = (
  input: GenerateTemplateFromReferenceVideoInput,
) => Promise<GenerateTemplateFromReferenceVideoResult>;

type CompareAndIterateReferenceVideoImpl = (
  input: CompareAndIterateReferenceVideoInput,
) => Promise<VideoCompareIterateResponse>;

let generateReferenceVideoTemplateOverride: GenerateReferenceVideoTemplateImpl | null = null;
let compareAndIterateReferenceVideoOverride: CompareAndIterateReferenceVideoImpl | null = null;

export function setGenerateReferenceVideoTemplateForTests(
  impl: GenerateReferenceVideoTemplateImpl | null,
) {
  generateReferenceVideoTemplateOverride = impl;
}

export function setCompareAndIterateReferenceVideoForTests(
  impl: CompareAndIterateReferenceVideoImpl | null,
) {
  compareAndIterateReferenceVideoOverride = impl;
}

function getClient(): GoogleGenAI {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }

  return client;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = String(value || '').trim();
  const hexMatch = trimmed.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    return `#${hexMatch[1].toUpperCase()}`;
  }

  const shortHexMatch = trimmed.match(/^#?([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    return `#${shortHexMatch[1].split('').map((char) => `${char}${char}`).join('').toUpperCase()}`;
  }

  return fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex, '#10151D').slice(1);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function safeSlug(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'reference-video-reel';
}

function resolveCanvas(orientation: ReferenceVideoAnalysis['orientation']) {
  if (orientation === 'landscape') {
    return { width: 1920, height: 1080 };
  }
  if (orientation === 'square') {
    return { width: 1080, height: 1080 };
  }
  return { width: 1080, height: 1920 };
}

function getPacingDurations(pacing: ReferenceVideoAnalysis['pacing'], durationBucket: ReferenceVideoAnalysis['durationBucket']) {
  const baseByDuration = {
    very_short: 1500,
    short: 1900,
    medium: 2300,
    long: 2800,
  } as const;
  const paceDelta = {
    slow: 400,
    steady: 150,
    fast: -150,
    punchy: -350,
  } as const;

  return clamp(baseByDuration[durationBucket] + paceDelta[pacing], 1200, 3200);
}

function buildScenePlan(analysis: ReferenceVideoAnalysis): ReferenceVideoSceneAnalysis[] {
  const sortedScenes = [...analysis.scenes].sort((left, right) => left.order - right.order);
  const frameCount = clamp(
    analysis.slideshowBlueprint.recommendedFrameCount || sortedScenes.length || analysis.majorSceneCount,
    3,
    6,
  );

  const trimmed = sortedScenes.slice(0, frameCount);
  const hasEndingCta = trimmed.some((scene) => scene.role === 'cta' || scene.role === 'brand');

  if (!hasEndingCta) {
    trimmed[trimmed.length - 1] = {
      order: trimmed.length,
      role: analysis.ctaTreatment === 'logo_end_card' ? 'brand' : 'cta',
      visualStyle: analysis.ctaTreatment === 'logo_end_card' ? 'logo_end_card' : 'text_panel',
      overlayPlacement: 'full',
      textAmount: 'medium',
      focus: 'Closing call to action',
    };
  }

  return trimmed.map((scene, index) => ({ ...scene, order: index + 1 }));
}

function sceneText(scene: ReferenceVideoSceneAnalysis, isFinalFrame: boolean) {
  if (isFinalFrame || scene.role === 'cta' || scene.role === 'brand') {
    return {
      headline: '{{company_name}}',
      subhead: '{{phone}}',
      body: '{{website}}',
      ctaLabel: 'BOOK NOW',
    };
  }

  if (scene.role === 'hook') {
    return {
      headline: '{{title}}',
      subhead: '{{subtitle}}',
      body: '{{body}}',
      ctaLabel: '',
    };
  }

  if (scene.role === 'problem' || scene.role === 'detail') {
    return {
      headline: '{{subtitle}}',
      subhead: '{{body}}',
      body: '{{service_areas}}',
      ctaLabel: '',
    };
  }

  return {
    headline: '{{title}}',
    subhead: '{{body}}',
    body: '{{service_areas}}',
    ctaLabel: '',
  };
}

function buildOverlayFrame(
  scene: ReferenceVideoSceneAnalysis,
  analysis: ReferenceVideoAnalysis,
  canvas: { width: number; height: number },
  imageIndex: number,
  durationMs: number,
): FrameDefinition {
  const marginX = Math.round(canvas.width * 0.055);
  const bottomSafe = Math.round(canvas.height * 0.07);
  const topSafe = Math.round(canvas.height * 0.06);
  const panelWidth = canvas.width - (marginX * 2);
  const placementHeights = {
    top: Math.round(canvas.height * 0.23),
    center: Math.round(canvas.height * 0.26),
    bottom: Math.round(canvas.height * 0.24),
    full: Math.round(canvas.height * 0.46),
  } as const;
  const panelHeight = placementHeights[scene.overlayPlacement];
  const panelY = scene.overlayPlacement === 'top'
    ? topSafe
    : scene.overlayPlacement === 'center'
      ? Math.round((canvas.height - panelHeight) / 2)
      : scene.overlayPlacement === 'full'
        ? Math.round(canvas.height * 0.44)
        : canvas.height - bottomSafe - panelHeight;

  const palette = {
    dominant: normalizeHexColor(analysis.colorDirection.dominantHex, '#10151D'),
    secondary: normalizeHexColor(analysis.colorDirection.secondaryHex, '#2B415C'),
    accent: normalizeHexColor(analysis.colorDirection.accentHex, '#4E8FE8'),
  };
  const text = sceneText(scene, false);
  const shouldShowBody = scene.textAmount === 'medium' || scene.textAmount === 'heavy' || analysis.headlineTextDensity === 'heavy';
  const overlayFill = analysis.overlayTreatment === 'light_panel'
    ? 'rgba(255,255,255,0.88)'
    : analysis.overlayTreatment === 'brand_blocks'
      ? hexToRgba(palette.dominant, 0.85)
      : analysis.overlayTreatment === 'gradient_scrim'
        ? hexToRgba('#10151D', 0.54)
        : analysis.overlayTreatment === 'minimal'
          ? hexToRgba('#10151D', 0.36)
          : hexToRgba('#10151D', 0.72);
  const textColor = analysis.overlayTreatment === 'light_panel' ? '#121821' : '#FFFFFF';
  const secondaryTextColor = analysis.overlayTreatment === 'light_panel' ? '#465467' : '#D7E1EE';

  if (scene.visualStyle === 'split_image' || scene.visualStyle === 'text_panel') {
    const imageHeight = Math.round(canvas.height * (canvas.height > canvas.width ? 0.52 : 0.6));
    const infoPanelY = imageHeight + Math.round(canvas.height * 0.02);
    const infoPanelHeight = canvas.height - infoPanelY - bottomSafe;
    const splitFill: FrameDefinition['background'] = scene.visualStyle === 'text_panel'
      ? { type: 'gradient', colors: [palette.dominant, palette.secondary], angle: 180 }
      : { type: 'solid', color: palette.dominant };

    return {
      durationMs,
      background: splitFill,
      layers: [
        {
          type: 'image',
          x: marginX,
          y: topSafe,
          width: panelWidth,
          height: imageHeight - topSafe,
          source: 'user_image',
          index: imageIndex,
          fit: 'cover',
          borderRadius: 28,
          shadow: {
            blur: 40,
            offsetX: 0,
            offsetY: 18,
            color: 'rgba(0,0,0,0.2)',
          },
        },
        {
          type: 'rect',
          x: marginX,
          y: infoPanelY,
          width: panelWidth,
          height: infoPanelHeight,
          fill: overlayFill,
          borderRadius: 30,
        },
        {
          type: 'text',
          content: text.headline,
          x: marginX + 44,
          y: infoPanelY + 42,
          width: panelWidth - 88,
          height: Math.round(infoPanelHeight * 0.34),
          fontFamily: 'Inter',
          fontSize: canvas.height > canvas.width ? 78 : 66,
          fontWeight: 'bold',
          color: textColor,
          align: 'left',
          maxLines: 3,
          lineHeight: 1.05,
        },
        {
          type: 'text',
          content: text.subhead,
          x: marginX + 44,
          y: infoPanelY + Math.round(infoPanelHeight * 0.44),
          width: panelWidth - 88,
          height: Math.round(infoPanelHeight * 0.2),
          fontFamily: 'Inter',
          fontSize: canvas.height > canvas.width ? 38 : 32,
          fontWeight: 'medium',
          color: secondaryTextColor,
          align: 'left',
          maxLines: 3,
          lineHeight: 1.18,
        },
        {
          type: 'accent_bar',
          x: marginX,
          y: infoPanelY + infoPanelHeight - 24,
          width: Math.round(panelWidth * 0.38),
          height: 18,
          color: '{{primary_colour}}',
        },
      ],
    };
  }

  return {
    durationMs,
    background: { type: 'image', source: 'user_image', index: imageIndex },
    layers: [
      {
        type: 'rect',
        x: marginX,
        y: panelY,
        width: panelWidth,
        height: panelHeight,
        fill: overlayFill,
        borderRadius: 32,
      },
      {
        type: 'text',
        content: text.headline,
        x: marginX + 42,
        y: panelY + 40,
        width: panelWidth - 84,
        height: Math.round(panelHeight * 0.34),
        fontFamily: 'Inter',
        fontSize: canvas.height > canvas.width ? 84 : 68,
        fontWeight: 'bold',
        color: textColor,
        align: 'left',
        maxLines: 3,
        lineHeight: 1.04,
      },
      {
        type: 'text',
        content: shouldShowBody ? text.subhead : '{{company_name}}',
        x: marginX + 42,
        y: panelY + Math.round(panelHeight * 0.54),
        width: panelWidth - 84,
        height: Math.round(panelHeight * 0.16),
        fontFamily: 'Inter',
        fontSize: canvas.height > canvas.width ? 34 : 28,
        fontWeight: shouldShowBody ? 'medium' : 'semibold',
        color: shouldShowBody ? secondaryTextColor : '{{primary_colour}}',
        align: 'left',
        maxLines: shouldShowBody ? 3 : 1,
        lineHeight: 1.18,
      },
      ...(shouldShowBody ? [{
        type: 'text' as const,
        content: text.body,
        x: marginX + 42,
        y: panelY + Math.round(panelHeight * 0.73),
        width: panelWidth - 84,
        height: Math.round(panelHeight * 0.13),
        fontFamily: 'Inter',
        fontSize: canvas.height > canvas.width ? 26 : 22,
        fontWeight: 'regular' as const,
        color: secondaryTextColor,
        align: 'left' as const,
        maxLines: 2,
      }] : []),
      {
        type: 'accent_bar',
        x: 0,
        y: canvas.height - 26,
        width: canvas.width,
        height: 26,
        color: '{{primary_colour}}',
      },
    ],
  };
}

function buildCtaFrame(
  analysis: ReferenceVideoAnalysis,
  canvas: { width: number; height: number },
  durationMs: number,
): FrameDefinition {
  const palette = {
    dominant: normalizeHexColor(analysis.colorDirection.dominantHex, '#10151D'),
    secondary: normalizeHexColor(analysis.colorDirection.secondaryHex, '#253B54'),
    accent: normalizeHexColor(analysis.colorDirection.accentHex, '#4E8FE8'),
  };
  const buttonWidth = Math.round(canvas.width * 0.58);
  const buttonX = Math.round((canvas.width - buttonWidth) / 2);
  const brandY = Math.round(canvas.height * 0.22);
  const nameY = Math.round(canvas.height * 0.42);
  const phoneY = Math.round(canvas.height * 0.56);
  const buttonY = Math.round(canvas.height * 0.66);
  const websiteY = Math.round(canvas.height * 0.81);

  return {
    durationMs,
    background: {
      type: 'gradient',
      colors: [palette.dominant, palette.secondary],
      angle: 180,
    },
    layers: [
      {
        type: 'logo',
        x: Math.round(canvas.width * 0.33),
        y: brandY,
        width: Math.round(canvas.width * 0.34),
        height: Math.round(canvas.height * 0.12),
        fit: 'contain',
        padding: 8,
      },
      {
        type: 'text',
        content: '{{company_name}}',
        x: Math.round(canvas.width * 0.12),
        y: nameY,
        width: Math.round(canvas.width * 0.76),
        height: Math.round(canvas.height * 0.11),
        fontFamily: 'Inter',
        fontSize: canvas.height > canvas.width ? 64 : 58,
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center',
        maxLines: 2,
        lineHeight: 1.08,
      },
      {
        type: 'text',
        content: '{{phone}}',
        x: Math.round(canvas.width * 0.16),
        y: phoneY,
        width: Math.round(canvas.width * 0.68),
        height: Math.round(canvas.height * 0.08),
        fontFamily: 'Inter',
        fontSize: canvas.height > canvas.width ? 52 : 46,
        fontWeight: 'bold',
        color: '{{primary_colour}}',
        align: 'center',
        maxLines: 1,
      },
      ...(analysis.ctaTreatment === 'text_only' ? [] : [
        {
          type: 'rect' as const,
          x: buttonX,
          y: buttonY,
          width: buttonWidth,
          height: Math.round(canvas.height * 0.07),
          fill: analysis.ctaTreatment === 'phone_banner' ? palette.accent : '{{primary_colour}}',
          borderRadius: 22,
        },
        {
          type: 'text' as const,
          content: analysis.ctaTreatment === 'phone_banner' ? 'CALL TODAY' : 'BOOK NOW',
          x: buttonX,
          y: buttonY + Math.round(canvas.height * 0.012),
          width: buttonWidth,
          height: Math.round(canvas.height * 0.05),
          fontFamily: 'Inter',
          fontSize: canvas.height > canvas.width ? 34 : 30,
          fontWeight: 'bold' as const,
          color: '#FFFFFF',
          align: 'center' as const,
          verticalAlign: 'middle' as const,
          maxLines: 1,
          textTransform: 'uppercase' as const,
          letterSpacing: 3,
        },
      ]),
      {
        type: 'text',
        content: '{{website}}',
        x: Math.round(canvas.width * 0.14),
        y: websiteY,
        width: Math.round(canvas.width * 0.72),
        height: Math.round(canvas.height * 0.04),
        fontFamily: 'Inter',
        fontSize: canvas.height > canvas.width ? 28 : 24,
        fontWeight: 'regular',
        color: '#C2CEDC',
        align: 'center',
        maxLines: 1,
      },
      {
        type: 'accent_bar',
        x: 0,
        y: canvas.height - 26,
        width: canvas.width,
        height: 26,
        color: '{{primary_colour}}',
      },
    ],
  };
}

export function synthesizeTemplateFromAnalysis(
  analysis: ReferenceVideoAnalysis,
  prompt?: string,
): TemplateDefinition {
  const canvas = resolveCanvas(analysis.orientation);
  const framePlan = buildScenePlan(analysis);
  const baseDuration = getPacingDurations(analysis.pacing, analysis.durationBucket);
  const imageFrameCount = Math.max(framePlan.filter((scene) => scene.role !== 'cta' && scene.role !== 'brand').length, 1);
  let nextImageIndex = 0;

  const frames = framePlan.map((scene, index) => {
    const isFinalFrame = index === framePlan.length - 1;
    const durationMs = isFinalFrame ? baseDuration + 500 : baseDuration;

    if (isFinalFrame || scene.role === 'cta' || scene.role === 'brand' || scene.visualStyle === 'logo_end_card') {
      return buildCtaFrame(analysis, canvas, durationMs);
    }

    const frame = buildOverlayFrame(scene, analysis, canvas, nextImageIndex, durationMs);
    nextImageIndex += 1;
    return frame;
  });

  const promptSuffix = prompt ? ` ${prompt}` : '';
  const template = {
    id: safeSlug(`reference-video-${analysis.orientation}-${analysis.pacing}`),
    name: `Reference Video Reel${promptSuffix ? ' Match' : ''}`.trim(),
    reference: safeSlug(`reference-video-${analysis.orientation}-${analysis.pacing}`),
    outputFormat: 'mp4',
    width: canvas.width,
    height: canvas.height,
    imageCount: imageFrameCount,
    categoryKeys: [
      'reel',
      'slideshow',
      'video_reference',
      analysis.orientation,
      'service_business',
    ],
    fps: analysis.pacing === 'slow' ? 24 : 30,
    transition: {
      type: analysis.slideshowBlueprint.transition,
      durationMs: analysis.pacing === 'punchy' ? 350 : analysis.pacing === 'fast' ? 500 : 700,
    },
    frames,
  };

  return templateSchema.parse(template) as TemplateDefinition;
}

async function waitForActiveFile(ai: GoogleGenAI, name: string) {
  const startTime = Date.now();

  while (Date.now() - startTime < DEFAULT_POLL_TIMEOUT_MS) {
    const file = await ai.files.get({ name });
    if (file.state === FileState.ACTIVE) {
      return file;
    }
    if (file.state === FileState.FAILED) {
      throw new Error(file.error?.message || 'Gemini failed to process the uploaded reference video.');
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out while Gemini was processing the uploaded reference video.');
}

async function uploadBlobAndWaitForActive(
  ai: GoogleGenAI,
  blob: Blob,
  mimeType: string,
  displayName: string,
) {
  const uploadedFile = await ai.files.upload({
    file: blob,
    config: {
      mimeType,
      displayName,
    },
  });

  if (!uploadedFile.name) {
    throw new Error(`Gemini did not return a file name for ${displayName}.`);
  }

  return waitForActiveFile(ai, uploadedFile.name);
}

function parseDataUri(dataUri: string): { mimeType: string; blob: Blob } {
  const match = String(dataUri || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error('Preview poster must be a valid data URI.');
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const bytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
  return {
    mimeType,
    blob: new Blob([bytes], { type: mimeType }),
  };
}

async function fetchRemoteBlob(url: string): Promise<{ blob: Blob; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Unable to fetch generated preview from ${url}: HTTP ${res.status}`);
  }

  const mimeType = String(res.headers.get('content-type') || 'video/mp4').split(';')[0].trim() || 'video/mp4';
  const arrayBuffer = await res.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: mimeType });
  return { blob, mimeType };
}

const videoCompareIterateSchema = z.object({
  score: z.number().min(1).max(10),
  feedback: z.string().min(1),
  shouldContinue: z.boolean(),
  changesApplied: z.string().min(1),
  analysis: referenceVideoAnalysisSchema.optional(),
});

const videoCompareIterateJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'feedback', 'shouldContinue', 'changesApplied'],
  properties: {
    score: { type: 'number', minimum: 1, maximum: 10 },
    feedback: { type: 'string' },
    shouldContinue: { type: 'boolean' },
    changesApplied: { type: 'string' },
    analysis: referenceVideoJsonSchema,
  },
} as const;

function buildVideoComparePrompt({
  existingTemplate,
  iterationHistory = [],
  iterationNumber = 1,
  maxIterations = 8,
  feedback,
  currentAnalysis,
}: Pick<CompareAndIterateReferenceVideoInput, 'existingTemplate' | 'iterationHistory' | 'iterationNumber' | 'maxIterations' | 'feedback' | 'currentAnalysis'>) {
  const phaseInstruction = iterationNumber <= 2
    ? 'Focus first on overall structure: scene count, opening/closing pattern, pacing bucket, overlay style, and CTA treatment.'
    : iterationNumber <= 4
      ? 'Focus on text density, scene role ordering, frame count, transition feel, and keeping the slideshow blueprint closer to the reference video.'
      : 'Focus on fine-tuning: confidence gaps, subtle pacing differences, scene emphasis, and end-card presentation.'

  const historySection = iterationHistory.length
    ? `\nPrevious iterations:\n${iterationHistory.map((entry) => `- Iteration ${entry.iteration}: score ${entry.score}/10 | ${entry.feedback} | ${entry.changesApplied}`).join('\n')}`
    : '';

  const feedbackSection = feedback
    ? `\nExtra user feedback to apply this round: ${feedback}`
    : '';

  const analysisSection = currentAnalysis
    ? `\nCurrent analysis used to synthesize the existing template:\n${JSON.stringify(currentAnalysis, null, 2)}`
    : '';

  return `You are reviewing two videos:
1. the REFERENCE video (target style/structure)
2. the GENERATED slideshow preview from our render engine

Important constraints:
- The output must remain a slideshow-style MP4 template with still-image frames and static overlays.
- Do not optimize for exact motion cloning, audio, captions, or frame-perfect recreation.
- Judge similarity by scene structure, pacing feel, text density, overlay treatment, CTA style, orientation, and overall visual direction.

Iteration ${iterationNumber} of ${maxIterations}.
${phaseInstruction}${feedbackSection}${historySection}${analysisSection}

Current template JSON:
${JSON.stringify(existingTemplate, null, 2)}

Return only JSON matching the schema with:
- score: 1-10 similarity score
- feedback: what still differs
- shouldContinue: whether another iteration is worthwhile
- changesApplied: concise summary of the next adjustment strategy
- analysis: a revised structured analysis to drive the next local template synthesis. Omit analysis only if shouldContinue is false and the current template is already good enough.`;
}

async function generateTemplateFromReferenceVideoInternal(
  input: GenerateTemplateFromReferenceVideoInput,
): Promise<GenerateTemplateFromReferenceVideoResult> {
  const ai = getClient();
  const uploadedFile = await ai.files.upload({
    file: input.video,
    config: {
      mimeType: input.mimeType,
      displayName: input.displayName || 'template-lab-reference-video',
    },
  });

  try {
    if (!uploadedFile.name) {
      throw new Error('Gemini did not return a file name for the uploaded reference video.');
    }

    const activeFile = await waitForActiveFile(ai, uploadedFile.name);
    if (!activeFile.uri || !activeFile.mimeType) {
      throw new Error('Gemini did not return a usable URI for the uploaded reference video.');
    }

    const promptParts = [
      createPartFromUri(activeFile.uri, activeFile.mimeType),
      `${ANALYSIS_PROMPT}${input.prompt ? `\n\nAdditional authoring guidance: ${input.prompt}` : ''}`,
    ];

    const response = await ai.models.generateContent({
      model: config.gemini.videoModel,
      contents: createUserContent(promptParts),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: referenceVideoJsonSchema,
        temperature: 0.2,
      },
    });

    const rawText = String(response.text || '').trim();
    if (!rawText) {
      throw new Error('Gemini returned an empty analysis for the reference video.');
    }

    const parsed = JSON.parse(rawText);
    const analysis = referenceVideoAnalysisSchema.parse(parsed) as ReferenceVideoAnalysis;
    const template = synthesizeTemplateFromAnalysis(analysis, input.prompt);

    return { analysis, template };
  } finally {
    if (uploadedFile.name) {
      await ai.files.delete({ name: uploadedFile.name }).catch((error) => {
        console.warn('[gemini-video] Failed to delete uploaded Gemini file:', error);
      });
    }
  }
}

export async function generateTemplateFromReferenceVideo(
  input: GenerateTemplateFromReferenceVideoInput,
): Promise<GenerateTemplateFromReferenceVideoResult> {
  if (generateReferenceVideoTemplateOverride) {
    return generateReferenceVideoTemplateOverride(input);
  }

  return generateTemplateFromReferenceVideoInternal(input);
}

async function compareAndIterateReferenceVideoInternal(
  input: CompareAndIterateReferenceVideoInput,
): Promise<VideoCompareIterateResponse> {
  const ai = getClient();
  const cleanupNames: string[] = [];

  try {
    const referenceFile = await uploadBlobAndWaitForActive(
      ai,
      input.video,
      input.mimeType,
      input.displayName || 'template-lab-reference-video',
    );
    cleanupNames.push(referenceFile.name || '');

    let generatedPreviewBlob: Blob;
    let generatedPreviewMimeType: string;

    if (input.generatedPreviewVideoUrl) {
      const fetchedPreview = await fetchRemoteBlob(input.generatedPreviewVideoUrl);
      generatedPreviewBlob = fetchedPreview.blob;
      generatedPreviewMimeType = fetchedPreview.mimeType;
    } else if (input.generatedPreviewPosterDataUri) {
      const posterPreview = parseDataUri(input.generatedPreviewPosterDataUri);
      generatedPreviewBlob = posterPreview.blob;
      generatedPreviewMimeType = posterPreview.mimeType;
    } else {
      throw new Error('A generated preview video URL or preview poster is required for video review.');
    }

    const generatedPreviewFile = await uploadBlobAndWaitForActive(
      ai,
      generatedPreviewBlob,
      generatedPreviewMimeType,
      'template-lab-generated-preview',
    );
    cleanupNames.push(generatedPreviewFile.name || '');

    if (!referenceFile.uri || !referenceFile.mimeType || !generatedPreviewFile.uri || !generatedPreviewFile.mimeType) {
      throw new Error('Gemini did not return usable file URIs for the video review step.');
    }

    const response = await ai.models.generateContent({
      model: config.gemini.videoModel,
      contents: createUserContent([
        createPartFromUri(referenceFile.uri, referenceFile.mimeType),
        createPartFromUri(generatedPreviewFile.uri, generatedPreviewFile.mimeType),
        buildVideoComparePrompt(input),
      ]),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: videoCompareIterateJsonSchema,
        temperature: 0.2,
      },
    });

    const rawText = String(response.text || '').trim();
    if (!rawText) {
      throw new Error('Gemini returned an empty comparison for the reference video review.');
    }

    const parsed = JSON.parse(rawText);
    const validated = videoCompareIterateSchema.parse(parsed);
    const shouldContinue = validated.shouldContinue;
    const nextAnalysis = validated.analysis;
    const nextTemplate = shouldContinue && nextAnalysis
      ? synthesizeTemplateFromAnalysis(nextAnalysis, input.prompt || input.feedback || '')
      : undefined;

    return {
      score: validated.score,
      feedback: validated.feedback,
      shouldContinue,
      changesApplied: validated.changesApplied,
      analysis: nextAnalysis,
      template: nextTemplate,
    } as CompareAndIterateResponse & { analysis?: ReferenceVideoAnalysis };
  } finally {
    await Promise.all(
      cleanupNames
        .filter(Boolean)
        .map((name) => ai.files.delete({ name }).catch((error) => {
          console.warn('[gemini-video] Failed to delete uploaded Gemini file:', error);
        })),
    );
  }
}

export async function compareAndIterateReferenceVideo(
  input: CompareAndIterateReferenceVideoInput,
): Promise<VideoCompareIterateResponse> {
  if (compareAndIterateReferenceVideoOverride) {
    return compareAndIterateReferenceVideoOverride(input);
  }

  return compareAndIterateReferenceVideoInternal(input);
}
