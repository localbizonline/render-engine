import path from 'path';
import { fileURLToPath } from 'url';
import { loadImage, type Image } from 'canvas';
import { renderPng } from '../engine/png-renderer.js';
import { renderMp4 } from '../engine/mp4-renderer.js';
import { loadRemoteImage } from '../engine/asset-loader.js';
import { uploadRender } from './r2-storage.js';
import type { RenderVariables, TemplateDefinition } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../public/designer-assets');

const DEFAULT_PREVIEW_VARIABLES: RenderVariables = {
  title: 'Professional Service Completed',
  post_title: 'Professional Service Completed',
  subtitle: 'Quality workmanship delivered on time and within budget',
  body: 'Sample post body text for preview purposes.',
  post_body: 'Sample post body text for preview purposes.',
  phone: '(021) 555-1234',
  phone_display: '(021) 555-1234',
  service_areas: 'Cape Town • Northern Suburbs • Southern Suburbs',
  primary_colour: '#235BAA',
  secondary_colour: '#4582D0',
  logo_url: '',
  square_logo_url: '',
  user_images: [],
  company_name: 'Sample Company',
  business_name: 'Sample Company',
  website: 'https://example.co.za',
};

type SampleAssets = {
  userImages: Image[];
  landscapeCtaImage: Image | null;
};

export interface TemplatePreviewOptions {
  frameIndex?: number;
  mode?: 'poster' | 'video';
}

export interface TemplatePreviewResult {
  previewBase64: string;
  previewPosterBase64: string;
  previewKind: 'image' | 'video';
  previewUrl?: string;
  previewWarning?: string;
  frameIndex: number;
  variables: RenderVariables;
}

let sampleAssetsPromise: Promise<SampleAssets> | null = null;

async function loadSampleAssets(): Promise<SampleAssets> {
  if (!sampleAssetsPromise) {
    sampleAssetsPromise = (async () => {
      const [img1, img2, landscapeCtaImage] = await Promise.all([
        loadImage(path.join(ASSETS_DIR, 'user_image_1.jpg')),
        loadImage(path.join(ASSETS_DIR, 'user_image_2.jpg')),
        loadImage(path.join(ASSETS_DIR, 'landscape_cta.png')).catch(() => null),
      ]);

      return {
        userImages: [img1, img2, img1, img2, img1, img2, img1, img2],
        landscapeCtaImage,
      };
    })();
  }

  return sampleAssetsPromise;
}

async function loadRemotePreviewAssets(variables: RenderVariables) {
  let logoImage: Image | null = null;
  if (variables.logo_url) {
    logoImage = await loadRemoteImage(variables.logo_url).catch(() => null);
  }

  const userImages: Image[] = [];
  for (const url of variables.user_images) {
    if (!url) continue;
    const img = await loadRemoteImage(url).catch(() => null);
    if (img) userImages.push(img);
  }

  let squareCtaImage: Image | null = null;
  if (variables.square_cta_image_url) {
    squareCtaImage = await loadRemoteImage(variables.square_cta_image_url).catch(() => null);
  }

  let landscapeCtaImage: Image | null = null;
  if (variables.landscape_cta_image_url) {
    landscapeCtaImage = await loadRemoteImage(variables.landscape_cta_image_url).catch(() => null);
  }

  return {
    userImages,
    logoImage,
    squareCtaImage,
    landscapeCtaImage,
  };
}

async function loadTemplateAssetImage(assetUrl: string): Promise<Image | null> {
  if (!assetUrl) return null;

  if (assetUrl.startsWith('data:')) {
    return loadImage(assetUrl).catch(() => null);
  }

  if (/^https?:\/\//i.test(assetUrl)) {
    return loadRemoteImage(assetUrl).catch(() => null);
  }

  if (assetUrl.startsWith('/designer-assets/')) {
    const assetName = path.basename(assetUrl);
    return loadImage(path.join(ASSETS_DIR, assetName)).catch(() => null);
  }

  if (assetUrl.startsWith('/')) {
    const localPath = path.resolve(__dirname, '../../public', assetUrl.replace(/^\/+/, ''));
    return loadImage(localPath).catch(() => null);
  }

  return loadImage(path.resolve(ASSETS_DIR, assetUrl)).catch(() => null);
}

async function loadTemplateAssetImages(template: TemplateDefinition): Promise<Record<string, Image | null>> {
  const assetUrls = new Set<string>();

  for (const frame of template.frames) {
    for (const layer of frame.layers) {
      if (layer.type === 'asset_image' && layer.assetUrl) {
        assetUrls.add(layer.assetUrl);
      }
    }
  }

  if (!assetUrls.size) {
    return {};
  }

  const entries = await Promise.all(
    Array.from(assetUrls).map(async (assetUrl) => {
      return [assetUrl, await loadTemplateAssetImage(assetUrl)] as const;
    }),
  );

  return Object.fromEntries(entries);
}

function mergePreviewVariables(variables: Partial<RenderVariables> = {}): RenderVariables {
  return {
    ...DEFAULT_PREVIEW_VARIABLES,
    ...variables,
    user_images: Array.isArray(variables.user_images) ? variables.user_images : DEFAULT_PREVIEW_VARIABLES.user_images,
  };
}

function hasExplicitPreviewAssets(variables: RenderVariables): boolean {
  return Boolean(
    variables.logo_url ||
    variables.user_images.some(Boolean) ||
    variables.square_cta_image_url ||
    variables.landscape_cta_image_url,
  );
}

function getRequiredUserImageCount(template: TemplateDefinition): number {
  let highestIndex = -1;

  for (const frame of template.frames) {
    if (frame.background.type === 'image') {
      highestIndex = Math.max(highestIndex, Number(frame.background.index) || 0);
    }

    for (const layer of frame.layers) {
      if (layer.type === 'image') {
        highestIndex = Math.max(highestIndex, Number(layer.index) || 0);
      }
    }
  }

  return Math.max(template.imageCount || 0, highestIndex + 1);
}

function ensureUserImageCoverage(userImages: Image[], requiredCount: number): Image[] {
  if (requiredCount <= 0 || userImages.length >= requiredCount || userImages.length === 0) {
    return userImages;
  }

  const expanded = [...userImages];
  while (expanded.length < requiredCount) {
    expanded.push(userImages[expanded.length % userImages.length]);
  }

  return expanded;
}

function clampFrameIndex(template: TemplateDefinition, frameIndex?: number): number {
  if (!template.frames.length) return 0;
  if (!Number.isInteger(frameIndex)) return 0;
  return Math.min(Math.max(Number(frameIndex), 0), template.frames.length - 1);
}

function toPreviewDataUri(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function buildPreviewVideoKey(template: TemplateDefinition): string {
  const safeId = String(template.reference || template.id || 'template-preview')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '') || 'template-preview';
  const nonce = Math.random().toString(36).slice(2, 10);
  return `previews/${safeId}-${Date.now()}-${nonce}.mp4`;
}

export async function renderTemplatePreview(
  template: TemplateDefinition,
  variables: Partial<RenderVariables> = {},
  options: TemplatePreviewOptions = {},
): Promise<TemplatePreviewResult> {
  const mergedVariables = mergePreviewVariables(variables);
  const previewMode = options.mode || 'poster';
  const frameIndex = clampFrameIndex(template, options.frameIndex);
  const requiredUserImageCount = getRequiredUserImageCount(template);

  let userImages: Image[] = [];
  let logoImage: Image | null = null;
  let squareCtaImage: Image | null = null;
  let landscapeCtaImage: Image | null = null;
  const assetImages = await loadTemplateAssetImages(template);

  if (hasExplicitPreviewAssets(mergedVariables)) {
    const remoteAssets = await loadRemotePreviewAssets(mergedVariables);
    userImages = ensureUserImageCoverage(remoteAssets.userImages, requiredUserImageCount);
    logoImage = remoteAssets.logoImage;
    squareCtaImage = remoteAssets.squareCtaImage;
    landscapeCtaImage = remoteAssets.landscapeCtaImage;
  } else {
    const sampleAssets = await loadSampleAssets();
    userImages = ensureUserImageCoverage(sampleAssets.userImages, requiredUserImageCount);
    landscapeCtaImage = sampleAssets.landscapeCtaImage;
  }

  const posterBuffer = renderPng({
    template,
    variables: mergedVariables,
    userImages,
    logoImage,
    squareCtaImage,
    landscapeCtaImage,
    assetImages,
    frameIndex,
  });

  const previewBase64 = toPreviewDataUri(posterBuffer);

  if (previewMode === 'video' && template.outputFormat === 'mp4' && template.frames.length > 1) {
    try {
      const mp4Buffer = await renderMp4({
        template,
        variables: mergedVariables,
        userImages,
        logoImage,
        squareCtaImage,
        landscapeCtaImage,
        assetImages,
      });

      const previewUrl = await uploadRender(mp4Buffer, buildPreviewVideoKey(template), 'video/mp4');

      return {
        previewBase64,
        previewPosterBase64: previewBase64,
        previewKind: 'video',
        previewUrl,
        frameIndex,
        variables: mergedVariables,
      };
    } catch (error) {
      const previewWarning = error instanceof Error
        ? `Video preview was unavailable, so a poster frame is shown instead: ${error.message}`
        : 'Video preview was unavailable, so a poster frame is shown instead.';

      return {
        previewBase64,
        previewPosterBase64: previewBase64,
        previewKind: 'image',
        previewWarning,
        frameIndex,
        variables: mergedVariables,
      };
    }
  }

  return {
    previewBase64,
    previewPosterBase64: previewBase64,
    previewKind: 'image',
    frameIndex,
    variables: mergedVariables,
  };
}
