import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hyperframesProvider,
  setHyperframesRenderOverrideForTests,
} from '../src/providers/hyperframes.ts';
import type { ProviderLabPostSnapshot } from '../src/providers/types.ts';

function buildSnapshot(
  overrides: Partial<ProviderLabPostSnapshot> = {},
): ProviderLabPostSnapshot {
  return {
    post: {
      id: 'post-1',
      org_id: 'org-1',
      category_id: 'cat-1',
      category_name: 'Recent Job',
      status: 'published',
      ...(overrides.post || {}),
    },
    content: {
      title: 'Kitchen makeover complete',
      subtitle: 'Custom cupboards installed',
      body: 'New storage, cleaner lines, and a brighter working space.',
      ...(overrides.content || {}),
    },
    brand: {
      company_name: 'Acme Services',
      primary_colour: '#123456',
      secondary_colour: '#abcdef',
      logo_url: null,
      ...(overrides.brand || {}),
    },
    media: {
      image_urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
      poster_url: null,
      video_url: null,
      ...(overrides.media || {}),
    },
    platform_context: {
      platforms: ['Instagram', 'Facebook'],
      variant: 'feed',
      ...(overrides.platform_context || {}),
    },
  };
}

async function captureHtml(snapshot: ProviderLabPostSnapshot, templateId: string): Promise<string> {
  let htmlDocument = '';

  setHyperframesRenderOverrideForTests(async ({ htmlDocument: nextHtmlDocument }) => {
    htmlDocument = nextHtmlDocument;
    return {
      templateId,
      mp4Buffer: Buffer.from('mp4'),
      posterBuffer: Buffer.from('poster'),
      durationMs: 1000,
      width: 1080,
      height: 1920,
    };
  });

  try {
    await hyperframesProvider.render({
      snapshot,
      mode: 'preview',
      templateId,
    });
  } finally {
    setHyperframesRenderOverrideForTests(null);
  }

  return htmlDocument;
}

test('basic Hyperframes template only renders post-sourced text', async () => {
  const html = await captureHtml(buildSnapshot(), 'hyperframes-basic-v1');

  assert.match(html, /Kitchen makeover complete/);
  assert.match(html, /Custom cupboards installed/);
  assert.match(html, /New storage, cleaner lines, and a brighter working space\./);
  assert.doesNotMatch(html, /Acme Services/);
  assert.doesNotMatch(html, /Recent Job/);
  assert.doesNotMatch(html, /Instagram/);
  assert.doesNotMatch(html, /Facebook/);
  assert.doesNotMatch(html, /Provider Lab Reel/);
  assert.doesNotMatch(html, /Real post snapshot/);
  assert.doesNotMatch(html, /Social Reel/);
});

test('split-panel Hyperframes template falls back within post copy only', async () => {
  const html = await captureHtml(buildSnapshot({
    content: {
      title: null,
      subtitle: null,
      body: 'Only the post body should appear on screen.',
    },
  }), 'hyperframes-split-panel-v1');

  assert.match(html, /Only the post body should appear on screen\./);
  assert.doesNotMatch(html, /Acme Services/);
  assert.doesNotMatch(html, /Recent Job/);
  assert.doesNotMatch(html, /Instagram/);
  assert.doesNotMatch(html, /Facebook/);
  assert.doesNotMatch(html, /Provider Lab Reel/);
  assert.doesNotMatch(html, /Real post snapshot/);
  assert.doesNotMatch(html, /Social Reel/);
});
