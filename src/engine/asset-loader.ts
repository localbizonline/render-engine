import { loadImage, Image } from 'canvas';
import sharp from 'sharp';

const imageCache = new Map<string, Image>();
const MAX_CACHE_SIZE = 100;

export async function loadRemoteImage(url: string): Promise<Image> {
  const cached = imageCache.get(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'RenderEngine/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image ${url}: ${response.status}`);
  }

  let buffer = Buffer.from(await response.arrayBuffer());

  // Convert WebP (and other unsupported formats) to PNG for node-canvas
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('webp') || url.endsWith('.webp') || isWebP(buffer)) {
    const converted = await sharp(buffer).png().toBuffer();
    buffer = Buffer.from(converted);
  }

  const img = await loadImage(buffer);

  // LRU eviction
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
  imageCache.set(url, img);

  return img;
}

/**
 * Check if a buffer starts with the WebP magic bytes (RIFF....WEBP).
 */
function isWebP(buf: Buffer): boolean {
  return buf.length > 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

export async function loadAllImages(urls: string[]): Promise<Map<string, Image>> {
  const results = new Map<string, Image>();
  const settled = await Promise.allSettled(
    urls.map(async (url) => {
      const img = await loadRemoteImage(url);
      return { url, img };
    })
  );

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.set(result.value.url, result.value.img);
    } else {
      console.warn('[asset-loader] Failed to load image:', result.reason);
    }
  }

  return results;
}
