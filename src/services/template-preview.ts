import path from 'path';
import { fileURLToPath } from 'url';
import { loadImage, type Image } from 'canvas';
import { renderPng } from '../engine/png-renderer.js';
import { loadRemoteImage } from '../engine/asset-loader.js';
import type { RenderVariables, TemplateDefinition } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../public/designer-assets');

const DEFAULT_PREVIEW_VARIABLES: RenderVariables = {
  title: 'Professional Service Completed',
  subtitle: 'Quality workmanship delivered on time and within budget',
  body: 'Sample post body text for preview purposes.',
  phone: '(021) 555-1234',
  service_areas: 'Cape Town • Northern Suburbs • Southern Suburbs',
  primary_colour: '#235BAA',
  secondary_colour: '#4582D0',
  logo_url: '',
  user_images: [],
  company_name: 'Sample Company',
  website: 'https://example.co.za',
};

type SampleAssets = {
  userImages: Image[];
  landscapeCtaImage: Image | null;
};

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
        userImages: [img1, img2],
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

export async function renderTemplatePreview(
  template: TemplateDefinition,
  variables: Partial<RenderVariables> = {},
): Promise<{ previewBase64: string; variables: RenderVariables }> {
  const mergedVariables = mergePreviewVariables(variables);

  let userImages: Image[] = [];
  let logoImage: Image | null = null;
  let squareCtaImage: Image | null = null;
  let landscapeCtaImage: Image | null = null;

  if (hasExplicitPreviewAssets(mergedVariables)) {
    const remoteAssets = await loadRemotePreviewAssets(mergedVariables);
    userImages = remoteAssets.userImages;
    logoImage = remoteAssets.logoImage;
    squareCtaImage = remoteAssets.squareCtaImage;
    landscapeCtaImage = remoteAssets.landscapeCtaImage;
  } else {
    const sampleAssets = await loadSampleAssets();
    userImages = sampleAssets.userImages;
    landscapeCtaImage = sampleAssets.landscapeCtaImage;
  }

  const previewBuffer = renderPng({
    template,
    variables: mergedVariables,
    userImages,
    logoImage,
    squareCtaImage,
    landscapeCtaImage,
  });

  return {
    previewBase64: `data:image/png;base64,${previewBuffer.toString('base64')}`,
    variables: mergedVariables,
  };
}
