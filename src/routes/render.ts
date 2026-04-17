import { Router } from 'express';
import { z } from 'zod';
import sharp from 'sharp';
import type { Image } from 'canvas';
import { templateSchema } from '../templates/schema.js';
import type { RenderVariables, TemplateDefinition } from '../types.js';
import { loadRemoteImage } from '../engine/asset-loader.js';
import { renderMp4 } from '../engine/mp4-renderer.js';
import { renderPng } from '../engine/png-renderer.js';
import { putAt } from '../services/r2-storage.js';

export const renderRouter = Router();

// ── Legacy 410 stubs (kept so external callers that still hold these URLs
// get a clear signal rather than a generic 404) ─────────────────────────

function removedAirtableRenderMessage() {
  return {
    success: false,
    error: 'Airtable-driven render endpoints have been removed from render-engine. Use social-posting-v2 for production render orchestration.',
  };
}

renderRouter.post('/sync', (_req, res) => {
  res.status(410).json(removedAirtableRenderMessage());
});

renderRouter.post('/test', (_req, res) => {
  res.status(410).json(removedAirtableRenderMessage());
});

// ── Production render endpoint ──────────────────────────────────────────
//
// Owned by social-posting-v2. V2 picks R2 keys; render-engine uploads the
// final MP4 and a poster JPG to those exact keys and echoes them back.
// Direct-to-R2 by design — MP4 bytes are never returned inline.

const assetsSchema = z.object({
  userImageUrls: z.array(z.string().url()).optional(),
  logoUrl: z.string().url().nullable().optional(),
  squareLogoUrl: z.string().url().nullable().optional(),
  squareCtaUrl: z.string().url().nullable().optional(),
  landscapeCtaUrl: z.string().url().nullable().optional(),
}).optional();

const variablesSchema = z.record(z.string(), z.unknown()).optional();

const renderOptionsSchema = z.object({
  jobId: z.string().optional(),
  outputVideoKey: z.string().min(1),
  outputPosterKey: z.string().min(1),
});

const renderRequestSchema = z.object({
  templateJson: z.unknown(),
  outputFormat: z.literal('mp4'),
  variables: variablesSchema,
  assets: assetsSchema,
  renderOptions: renderOptionsSchema,
});

function failBadRequest(res: import('express').Response, error: string) {
  res.status(400).json({ success: false, error });
}

function coerceRenderVariables(input: Record<string, unknown> | undefined): RenderVariables {
  const v = input || {};
  const asString = (key: string): string => {
    const raw = v[key];
    return typeof raw === 'string' ? raw : '';
  };
  const userImages = Array.isArray(v.user_images)
    ? v.user_images.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    title: asString('title'),
    subtitle: asString('subtitle'),
    body: asString('body'),
    phone: asString('phone'),
    service_areas: asString('service_areas'),
    primary_colour: asString('primary_colour'),
    secondary_colour: asString('secondary_colour'),
    logo_url: asString('logo_url'),
    user_images: userImages,
    company_name: asString('company_name'),
    website: asString('website') || undefined,
    square_cta_image_url: asString('square_cta_image_url') || undefined,
    landscape_cta_image_url: asString('landscape_cta_image_url') || undefined,
  };
}

async function loadOptionalImage(url: string | null | undefined): Promise<Image | null> {
  if (!url) return null;
  try {
    return await loadRemoteImage(url);
  } catch (err) {
    console.warn('[render] optional asset failed to load:', url, err);
    return null;
  }
}

async function loadRequiredUserImages(urls: string[] | undefined): Promise<Image[]> {
  if (!urls || urls.length === 0) return [];
  const images: Image[] = [];
  for (const url of urls) {
    // Fail loudly on user-image load errors — they are the post content.
    const img = await loadRemoteImage(url);
    images.push(img);
  }
  return images;
}

renderRouter.post('/', async (req, res) => {
  const parsed = renderRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return failBadRequest(res, `Invalid request: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  const { templateJson, variables, assets, renderOptions } = parsed.data;

  const templateResult = templateSchema.safeParse(templateJson);
  if (!templateResult.success) {
    return failBadRequest(res, `Invalid templateJson: ${templateResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }

  const template = templateResult.data as TemplateDefinition;
  if (template.outputFormat !== 'mp4') {
    return failBadRequest(res, 'templateJson.outputFormat must be "mp4"');
  }
  if (!template.frames || template.frames.length < 2) {
    return failBadRequest(res, 'MP4 templates require at least 2 frames');
  }

  const renderVariables = coerceRenderVariables(variables as Record<string, unknown> | undefined);
  const t0 = Date.now();

  try {
    const [userImages, logoImage, squareCtaImage, landscapeCtaImage] = await Promise.all([
      loadRequiredUserImages(assets?.userImageUrls),
      loadOptionalImage(assets?.logoUrl || renderVariables.logo_url || null),
      loadOptionalImage(assets?.squareCtaUrl || renderVariables.square_cta_image_url || null),
      loadOptionalImage(assets?.landscapeCtaUrl || renderVariables.landscape_cta_image_url || null),
    ]);

    const mp4Buffer = await renderMp4({
      template,
      variables: renderVariables,
      userImages,
      logoImage,
      squareCtaImage,
      landscapeCtaImage,
    });

    // Poster = first frame re-rendered deterministically, encoded as JPEG.
    // Cheaper and more reliable than a second ffmpeg invocation.
    const posterPng = renderPng({
      template,
      variables: renderVariables,
      userImages,
      logoImage,
      squareCtaImage,
      landscapeCtaImage,
      frameIndex: 0,
    });
    const posterJpeg = await sharp(posterPng).jpeg({ quality: 85 }).toBuffer();

    await Promise.all([
      putAt(renderOptions.outputVideoKey, mp4Buffer, 'video/mp4'),
      putAt(renderOptions.outputPosterKey, posterJpeg, 'image/jpeg'),
    ]);

    return res.json({
      success: true,
      r2Key: renderOptions.outputVideoKey,
      posterR2Key: renderOptions.outputPosterKey,
      meta: {
        renderTimeMs: Date.now() - t0,
        jobId: renderOptions.jobId,
        videoBytes: mp4Buffer.length,
        posterBytes: posterJpeg.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[render] MP4 render failed:', message);
    return res.status(500).json({ success: false, error: message });
  }
});
