import { loadImage, Image } from 'canvas';

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

  const buffer = Buffer.from(await response.arrayBuffer());
  const img = await loadImage(buffer);

  // LRU eviction
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
  imageCache.set(url, img);

  return img;
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
