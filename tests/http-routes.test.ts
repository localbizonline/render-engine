import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { config } from '../src/config.ts';
import {
  setCompareAndIterateReferenceVideoForTests,
  setGenerateReferenceVideoTemplateForTests,
} from '../src/services/gemini-video.ts';
import {
  clearDesignerChatSessionsForTests,
  setDesignerChatToolOverridesForTests,
} from '../src/services/designer-chat.ts';
import {
  buildHyperframesCompositionDocument,
  setHyperframesRenderOverrideForTests,
} from '../src/providers/hyperframes.ts';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');

  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Failed to resolve test server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await closeServer(server);
  }
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
    server.closeAllConnections();
  });
}

test('HTTP route /designer serves the real Template Lab shell', async () => {
  await withServer(async (baseUrl) => {
    const [designerRes, designerHtmlRes, providerLabRes, promptRes, referenceVideoRes, v2Res] = await Promise.all([
      fetch(`${baseUrl}/designer`),
      fetch(`${baseUrl}/designer.html`),
      fetch(`${baseUrl}/designer/provider-lab`),
      fetch(`${baseUrl}/designer/prompt?prompt=from%20text`),
      fetch(`${baseUrl}/designer/reference-video?prompt=match%20style`),
      fetch(`${baseUrl}/designer/v2`),
    ]);

    assert.equal(designerRes.status, 200);
    assert.equal(designerHtmlRes.status, 200);
    assert.equal(providerLabRes.status, 200);
    assert.equal(promptRes.status, 200);
    assert.equal(referenceVideoRes.status, 200);
    assert.equal(v2Res.status, 200);
    assert.match(designerRes.headers.get('content-type') || '', /text\/html/i);
    assert.match(designerHtmlRes.headers.get('content-type') || '', /text\/html/i);

    const [designerHtml, designerHtmlAlias, providerLabHtml, promptHtml, referenceVideoHtml, v2Html] = await Promise.all([
      designerRes.text(),
      designerHtmlRes.text(),
      providerLabRes.text(),
      promptRes.text(),
      referenceVideoRes.text(),
      v2Res.text(),
    ]);

    assert.equal(designerHtml, designerHtmlAlias);
    assert.equal(designerHtml, providerLabHtml);
    assert.equal(designerHtml, promptHtml);
    assert.equal(designerHtml, referenceVideoHtml);
    assert.equal(designerHtml, v2Html);
    assert.match(designerHtml, /<title>Reel Template Studio<\/title>/);
    assert.match(designerHtml, /<script src="\/designer-v2-bridge\.js"><\/script>/);
    assert.match(designerHtml, /<script src="\/vendor\/konva\.min\.js"><\/script>/);
    assert.match(designerHtml, /<script src="\/designer-canvas-editor\.js"><\/script>/);
    assert.match(designerHtml, /<script src="\/designer-app\.js"><\/script>/);
    assert.match(designerHtml, /id="btnCopyV2TemplateId"/);
    assert.match(designerHtml, /id="btnCopyV2ExportUrl"/);
    assert.match(designerHtml, /id="btnRefreshProviderLabRecent"/);
    assert.match(designerHtml, /id="providerLabRecentList"/);
    assert.match(designerHtml, /id="canvasEditorHost"/);
    assert.match(designerHtml, /id="btnCanvasLayerUp"/);
    assert.match(designerHtml, /id="btnCanvasLayerHide"/);
    assert.match(designerHtml, /id="btnCanvasUndo"/);
    assert.match(designerHtml, /id="btnUploadCanvasAsset"/);
  });
});

test('HTTP routes serve the extracted Template Lab scripts as JavaScript assets', async () => {
  await withServer(async (baseUrl) => {
    const [bootstrapRes, bridgeRes, canvasEditorRes, konvaRes, appRes] = await Promise.all([
      fetch(`${baseUrl}/designer-bootstrap.js`),
      fetch(`${baseUrl}/designer-v2-bridge.js`),
      fetch(`${baseUrl}/designer-canvas-editor.js`),
      fetch(`${baseUrl}/vendor/konva.min.js`),
      fetch(`${baseUrl}/designer-app.js`),
    ]);

    assert.equal(bootstrapRes.status, 200);
    assert.equal(bridgeRes.status, 200);
    assert.equal(canvasEditorRes.status, 200);
    assert.equal(konvaRes.status, 200);
    assert.equal(appRes.status, 200);

    const [bootstrapSource, bridgeSource, canvasEditorSource, konvaSource, appSource] = await Promise.all([
      bootstrapRes.text(),
      bridgeRes.text(),
      canvasEditorRes.text(),
      konvaRes.text(),
      appRes.text(),
    ]);

    assert.match(bootstrapSource, /__TEMPLATE_LAB_BOOTSTRAP__/);
    assert.doesNotMatch(bridgeSource, /<!DOCTYPE html>/i);
    assert.doesNotMatch(canvasEditorSource, /<!DOCTYPE html>/i);
    assert.doesNotMatch(konvaSource, /<!DOCTYPE html>/i);
    assert.doesNotMatch(appSource, /<!DOCTYPE html>/i);
    assert.match(bridgeSource, /function createTemplateLabV2Bridge/);
    assert.match(canvasEditorSource, /function createTemplateLabCanvasEditor/);
    assert.match(konvaSource, /Konva/);
    assert.match(appSource, /async function approveTemplateForV2/);
    assert.match(appSource, /btnCopyV2TemplateId/);
    assert.match(bridgeSource, /async function listExperimentPosts/);
    assert.match(appSource, /async function loadProviderLabRecentPosts/);
  });
});

test('HTTP designer chat route can generate and continue a draft across turns', async () => {
  setDesignerChatToolOverridesForTests({
    async generateTemplate(prompt) {
      assert.match(prompt, /Create a new MP4 reel template draft/i);
      assert.match(prompt, /Create a bold plumbing reel/i);
      return {
        id: 'chat-generated',
        reference: 'chat-generated',
        name: 'Chat Generated',
        outputFormat: 'mp4',
        width: 1080,
        height: 1920,
        imageCount: 4,
        categoryKeys: [],
        frames: [
          {
            durationMs: 1000,
            background: { type: 'solid', color: '#10151D' },
            layers: [],
          },
          {
            durationMs: 1000,
            background: { type: 'solid', color: '#18212D' },
            layers: [],
          },
        ],
      };
    },
    async iterateTemplate(prompt, existingTemplate) {
      assert.equal(existingTemplate.id, 'chat-generated');
      assert.match(prompt, /Make it more premium/i);
      return {
        ...existingTemplate,
        id: 'chat-generated-v2',
        reference: 'chat-generated-v2',
        name: 'Chat Generated Refined',
      };
    },
    async renderPreview(template) {
      return {
        previewBase64: `data:image/png;base64,${template.id}`,
        previewPosterBase64: `data:image/png;base64,${template.id}`,
        previewKind: 'image',
        previewUrl: '',
        previewWarning: '',
        frameIndex: 0,
      };
    },
  });

  try {
    await withServer(async (baseUrl) => {
      const firstRes = await fetch(`${baseUrl}/api/designer/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Create a bold plumbing reel',
          draftContext: {
            referenceInputMode: 'prompt',
            prompt: '',
          },
        }),
      });

      assert.equal(firstRes.status, 200);
      const firstBody = await firstRes.json();
      assert.equal(firstBody.action, 'generated');
      assert.equal(firstBody.template.id, 'chat-generated');
      assert.equal(firstBody.messages.length, 2);

      const secondRes = await fetch(`${baseUrl}/api/designer/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: firstBody.sessionId,
          message: 'Make it more premium',
          draftContext: {
            referenceInputMode: 'prompt',
            prompt: 'Create a bold plumbing reel',
            currentTemplate: firstBody.template,
            currentPreview: firstBody.previewBase64,
          },
        }),
      });

      assert.equal(secondRes.status, 200);
      const secondBody = await secondRes.json();
      assert.equal(secondBody.action, 'iterated');
      assert.equal(secondBody.template.id, 'chat-generated-v2');
      assert.equal(secondBody.messages.length, 4);
      assert.match(secondBody.assistantMessage.content, /fresh preview/i);
    });
  } finally {
    setDesignerChatToolOverridesForTests(null);
    clearDesignerChatSessionsForTests();
  }
});

test('HTTP designer bootstrap and V2 proxy routes expose the auto-configured studio defaults', async () => {
  const previousApiKey = config.apiKey;
  const previousBaseUrl = config.designer.defaultV2BaseUrl;
  const previousAdminSecret = config.designer.defaultV2AdminSecret;

  config.apiKey = 'render-test-key';
  config.designer.defaultV2BaseUrl = 'https://admin.localpros.co.za';
  config.designer.defaultV2AdminSecret = 'server-secret';

  const originalFetch = global.fetch;
  const upstreamCalls: Array<{ url: string; init?: RequestInit }> = [];

  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const resolvedUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (resolvedUrl.startsWith('http://127.0.0.1:')) {
      return originalFetch(url as string, init);
    }
    upstreamCalls.push({ url: resolvedUrl, init });
    return new Response(JSON.stringify({ ok: true, id: 'rt_proxy' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await withServer(async (baseUrl) => {
      const bootstrapRes = await fetch(`${baseUrl}/designer-bootstrap.js`);
      const bootstrapSource = await bootstrapRes.text();

      assert.equal(bootstrapRes.status, 200);
      assert.match(bootstrapSource, /"renderApiKey":"render-test-key"/);
      assert.match(bootstrapSource, /"v2BaseUrl":"https:\/\/admin\.localpros\.co\.za"/);
      assert.match(bootstrapSource, /"v2ServerProxyEnabled":true/);

      const exportRes = await fetch(`${baseUrl}/api/designer/v2/export?url=${encodeURIComponent('https://rep.localpros.co.za/api/admin/render-templates/rt_proxy/export')}`, {
        headers: { 'X-Api-Key': 'render-test-key' },
      });
      assert.equal(exportRes.status, 200);
      assert.equal(upstreamCalls[0]?.url, 'https://rep.localpros.co.za/api/admin/render-templates/rt_proxy/export');
      assert.equal((upstreamCalls[0]?.init?.headers as Record<string, string>).Authorization, 'Bearer server-secret');

      const importRes = await fetch(`${baseUrl}/api/designer/v2/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'render-test-key',
        },
        body: JSON.stringify({ reference: 'proxy-template' }),
      });
      assert.equal(importRes.status, 200);
      assert.equal(upstreamCalls[1]?.url, 'https://admin.localpros.co.za/api/admin/render-templates/import');
      assert.equal((upstreamCalls[1]?.init?.headers as Record<string, string>).Authorization, 'Bearer server-secret');
      assert.equal(String(upstreamCalls[1]?.init?.body), '{"reference":"proxy-template"}');

      const postRes = await fetch(`${baseUrl}/api/designer/v2/post?id=post_123`, {
        headers: { 'X-Api-Key': 'render-test-key' },
      });
      assert.equal(postRes.status, 200);
      assert.equal(upstreamCalls[2]?.url, 'https://admin.localpros.co.za/api/admin/experiment-posts/post_123');
      assert.equal((upstreamCalls[2]?.init?.headers as Record<string, string>).Authorization, 'Bearer server-secret');

      const recentPostsRes = await fetch(`${baseUrl}/api/designer/v2/posts/recent?limit=8&status=ready`, {
        headers: { 'X-Api-Key': 'render-test-key' },
      });
      assert.equal(recentPostsRes.status, 200);
      assert.equal(upstreamCalls[3]?.url, 'https://admin.localpros.co.za/api/admin/experiment-posts?limit=8&status=ready');
      assert.equal((upstreamCalls[3]?.init?.headers as Record<string, string>).Authorization, 'Bearer server-secret');
    });
  } finally {
    global.fetch = originalFetch;
    config.apiKey = previousApiKey;
    config.designer.defaultV2BaseUrl = previousBaseUrl;
    config.designer.defaultV2AdminSecret = previousAdminSecret;
  }
});

test('HTTP provider-lab providers route exposes template metadata for implemented providers', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/designer/provider-lab/providers`);
    assert.equal(res.status, 200);
    const body = await res.json() as {
      providers: Array<{
        id: string;
        label: string;
        defaultTemplateId: string | null;
        templates: Array<{ id: string; label: string }>;
      }>;
    };

    const hyperframes = body.providers.find((provider) => provider.id === 'hyperframes');
    assert.ok(hyperframes);
    assert.equal(hyperframes?.defaultTemplateId, 'hyperframes-basic-v1');
    assert.ok((hyperframes?.templates || []).length >= 2);
    assert.ok(hyperframes?.templates.some((template) => template.id === 'hyperframes-split-panel-v1'));
  });
});

test('HTTP health route stays public while the Template Lab runtime still exposes local templates', async () => {
  await withServer(async (baseUrl) => {
    const [healthRes, templatesRes] = await Promise.all([
      fetch(`${baseUrl}/health`),
      fetch(`${baseUrl}/api/templates`),
    ]);

    assert.equal(healthRes.status, 200);
    assert.equal(templatesRes.status, 200);
    assert.match(healthRes.headers.get('content-type') || '', /application\/json/i);
    assert.match(templatesRes.headers.get('content-type') || '', /application\/json/i);

    const health = await healthRes.json() as { status: string; timestamp: string };
    const templates = await templatesRes.json() as {
      templates: Array<{ id: string; name: string; outputFormat: string; imageCount: number }>;
    };

    assert.equal(health.status, 'ok');
    assert.ok(Date.parse(health.timestamp));
    assert.ok(templates.templates.length > 0);
    assert.ok(templates.templates.some((template) => template.id === 'slideshow-base' && template.outputFormat === 'mp4'));
    assert.ok(templates.templates.some((template) => template.id === 'vertical-reel-base' && template.outputFormat === 'mp4'));
  });
});

test('HTTP POST /api/render validates the request envelope before doing any rendering work', async () => {
  await withServer(async (baseUrl) => {
    // Missing renderOptions
    const missingOptions = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateJson: { outputFormat: 'mp4' },
        outputFormat: 'mp4',
      }),
    });
    assert.equal(missingOptions.status, 400);
    const missingOptionsBody = await missingOptions.json() as { success: boolean; error: string };
    assert.equal(missingOptionsBody.success, false);
    assert.match(missingOptionsBody.error, /renderOptions/);

    // outputFormat must be mp4 (v1 scope)
    const wrongFormat = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateJson: { outputFormat: 'mp4' },
        outputFormat: 'png',
        renderOptions: {
          outputVideoKey: 'orgX/video/test.mp4',
          outputPosterKey: 'orgX/video/test-poster.jpg',
        },
      }),
    });
    assert.equal(wrongFormat.status, 400);
    const wrongFormatBody = await wrongFormat.json() as { success: boolean; error: string };
    assert.equal(wrongFormatBody.success, false);

    // Malformed templateJson is rejected before we even try to load assets
    const badTemplate = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateJson: { not: 'a template' },
        outputFormat: 'mp4',
        renderOptions: {
          outputVideoKey: 'orgX/video/test.mp4',
          outputPosterKey: 'orgX/video/test-poster.jpg',
        },
      }),
    });
    assert.equal(badTemplate.status, 400);
    const badTemplateBody = await badTemplate.json() as { success: boolean; error: string };
    assert.equal(badTemplateBody.success, false);
    assert.match(badTemplateBody.error, /templateJson/);

    // Valid-shaped MP4 template with only 1 frame → rejected (needs at least 2)
    const singleFrame = await fetch(`${baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateJson: {
          id: 'single-frame',
          name: 'Single Frame',
          reference: 'single-frame',
          outputFormat: 'mp4',
          width: 1080,
          height: 1920,
          imageCount: 0,
          categoryKeys: [],
          fps: 30,
          frames: [
            { durationMs: 1000, background: { type: 'solid', color: '#000000' }, layers: [] },
          ],
        },
        outputFormat: 'mp4',
        renderOptions: {
          outputVideoKey: 'orgX/video/test.mp4',
          outputPosterKey: 'orgX/video/test-poster.jpg',
        },
      }),
    });
    assert.equal(singleFrame.status, 400);
    const singleFrameBody = await singleFrame.json() as { success: boolean; error: string };
    assert.match(singleFrameBody.error, /at least 2 frames/i);
  });
});

test('HTTP POST /api/render/hyperframes returns caller-owned artifact keys for composition renders', async () => {
  setHyperframesRenderOverrideForTests(async () => ({
    templateId: 'hyperframes-basic-v1',
    mp4Buffer: Buffer.from('fake-mp4'),
    posterBuffer: Buffer.from('fake-poster'),
    durationMs: 8400,
    width: 1080,
    height: 1920,
  }));

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/render/hyperframes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          composition_html: '<div id="root"></div>',
          composition_css: '#root { width: 1080px; height: 1920px; }',
          composition_js: 'window.__compositionDurationSeconds = 8.4;',
          props: {
            runtime: {
              duration_seconds: 8.4,
            },
          },
          assets: {
            uploaded_photos: [],
            logos: {
              logo_url: null,
              square_logo_url: null,
            },
            cta_assets: {
              landscape_url: null,
              square_url: null,
            },
          },
          renderOptions: {
            jobId: 'hf-job-1',
            outputVideoKey: 'org1/hyperframes/run-1.mp4',
            outputPosterKey: 'org1/hyperframes/run-1-poster.png',
          },
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json() as {
        success: boolean;
        r2Key: string;
        posterR2Key: string;
        meta: { durationMs: number; width: number; height: number };
      };

      assert.equal(body.success, true);
      assert.equal(body.r2Key, 'org1/hyperframes/run-1.mp4');
      assert.equal(body.posterR2Key, 'org1/hyperframes/run-1-poster.png');
      assert.equal(body.meta.durationMs, 8400);
      assert.equal(body.meta.width, 1080);
      assert.equal(body.meta.height, 1920);
    });
  } finally {
    setHyperframesRenderOverrideForTests(null);
  }
});

test('Hyperframes composition document injects runtime props for the official CLI renderer', () => {
  const html = buildHyperframesCompositionDocument({
    compositionHtml: '<div id="root"></div>',
    compositionCss: '#root { width: 1080px; height: 1920px; }',
    compositionJs: 'window.__compositionDurationSeconds = 6.2;',
    props: {
      runtime: {
        duration_seconds: 6.2,
      },
    },
    assets: {
      uploaded_photos: [],
    },
    slotConstraints: {},
  });

  assert.match(html, /window\.__timelines = window\.__timelines \|\| \{\};/);
  assert.match(html, /window\.__HYPERFRAMES_PROPS__/);
  assert.match(html, /window\.__HYPERFRAMES_ASSETS__/);
  assert.match(html, /gsap@3\/dist\/gsap\.min\.js/);
});

test('HTTP POST /api/render/hyperframes/preview returns caller-owned preview artifact keys for composition renders', async () => {
  setHyperframesRenderOverrideForTests(async ({ mode }) => ({
    templateId: 'hyperframes-basic-v1',
    mp4Buffer: Buffer.from(mode === 'preview' ? 'preview-mp4' : 'final-mp4'),
    posterBuffer: Buffer.from('preview-poster'),
    durationMs: 6200,
    width: 1080,
    height: 1920,
  }));

  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/render/hyperframes/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          composition_html: '<div id="root"></div>',
          composition_css: '#root { width: 1080px; height: 1920px; }',
          composition_js: 'window.__compositionDurationSeconds = 6.2;',
          props: {
            runtime: {
              duration_seconds: 6.2,
            },
          },
          assets: {
            uploaded_photos: [],
            logos: {
              logo_url: null,
              square_logo_url: null,
            },
            cta_assets: {
              landscape_url: null,
              square_url: null,
            },
          },
          renderOptions: {
            jobId: 'hf-preview-1',
            outputVideoKey: 'org1/hyperframes/previews/run-1.mp4',
            outputPosterKey: 'org1/hyperframes/previews/run-1-poster.png',
          },
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json() as {
        success: boolean;
        r2Key: string;
        posterR2Key: string;
        meta: { renderMode: string; durationMs: number; width: number; height: number };
      };

      assert.equal(body.success, true);
      assert.equal(body.r2Key, 'org1/hyperframes/previews/run-1.mp4');
      assert.equal(body.posterR2Key, 'org1/hyperframes/previews/run-1-poster.png');
      assert.equal(body.meta.renderMode, 'preview');
      assert.equal(body.meta.durationMs, 6200);
      assert.equal(body.meta.width, 1080);
      assert.equal(body.meta.height, 1920);
    });
  } finally {
    setHyperframesRenderOverrideForTests(null);
  }
});

test('HTTP legacy Airtable-backed routes still return 410 Gone', async () => {
  await withServer(async (baseUrl) => {
    const [managedTemplatesRes, syncRenderRes, testRenderRes] = await Promise.all([
      fetch(`${baseUrl}/api/templates/managed`),
      fetch(`${baseUrl}/api/render/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: 'rec_test' }),
      }),
      fetch(`${baseUrl}/api/render/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: 'rec_test' }),
      }),
    ]);

    assert.equal(managedTemplatesRes.status, 410);
    assert.equal(syncRenderRes.status, 410);
    assert.equal(testRenderRes.status, 410);

    const managedTemplates = await managedTemplatesRes.json() as { error: string };
    const syncRender = await syncRenderRes.json() as { success: boolean; error: string };
    const testRender = await testRenderRes.json() as { success: boolean; error: string };

    assert.match(managedTemplates.error, /social-posting-v2/);
    assert.equal(syncRender.success, false);
    assert.equal(testRender.success, false);
    assert.match(syncRender.error, /render-engine/);
    assert.match(testRender.error, /social-posting-v2/);
  });
});

test('HTTP preview route supports reel-style preview responses with poster fallback metadata', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        previewMode: 'video',
        templateJson: {
          id: 'test-reel',
          name: 'Test Reel',
          reference: 'test-reel',
          outputFormat: 'mp4',
          width: 1080,
          height: 1920,
          imageCount: 2,
          categoryKeys: ['reel'],
          fps: 30,
          transition: {
            type: 'fade',
            durationMs: 500,
          },
          frames: [
            {
              durationMs: 1000,
              background: { type: 'solid', color: '#111111' },
              layers: [],
            },
            {
              durationMs: 1000,
              background: { type: 'solid', color: '#222222' },
              layers: [],
            },
          ],
        },
      }),
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/i);

    const data = await res.json() as {
      previewBase64: string;
      previewPosterBase64?: string;
      previewKind?: string;
      previewUrl?: string;
      previewWarning?: string;
      width: number;
      height: number;
    };

    assert.match(data.previewBase64, /^data:image\/png;base64,/);
    assert.match(data.previewPosterBase64 || '', /^data:image\/png;base64,/);
    assert.equal(data.width, 1080);
    assert.equal(data.height, 1920);
    assert.ok(data.previewKind === 'video' || data.previewKind === 'image');
    if (data.previewKind === 'video') {
      assert.ok(Boolean(data.previewUrl));
    } else {
      assert.ok(Boolean(data.previewWarning));
    }
  });
});

test('HTTP design/video route rejects requests without a multipart video upload', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/design/video`, {
      method: 'POST',
      body: new FormData(),
    });

    assert.equal(res.status, 400);
    const data = await res.json() as { error: string };
    assert.match(data.error, /referenceVideo is required/i);
  });
});

test('HTTP design/video route accepts multipart MP4 or MOV uploads and returns a reel preview payload', async () => {
  setGenerateReferenceVideoTemplateForTests(async () => ({
    analysis: {
      orientation: 'portrait',
      aspectRatio: '9:16',
      durationBucket: 'short',
      pacing: 'fast',
      majorSceneCount: 4,
      headlineTextDensity: 'medium',
      overlayTreatment: 'dark_panel',
      ctaTreatment: 'button_end_card',
      colorDirection: {
        mood: 'bold and modern',
        dominantHex: '#10151D',
        secondaryHex: '#29415B',
        accentHex: '#4E8FE8',
        contrast: 'high',
      },
      slideshowBlueprint: {
        recommendedFrameCount: 4,
        transition: 'fade',
        openingStyle: 'strong hook',
        closingStyle: 'direct CTA',
      },
      scenes: [
        { order: 1, role: 'hook', visualStyle: 'full_bleed_image', overlayPlacement: 'bottom', textAmount: 'medium', focus: 'Hook' },
        { order: 2, role: 'proof', visualStyle: 'split_image', overlayPlacement: 'bottom', textAmount: 'light', focus: 'Proof' },
        { order: 3, role: 'detail', visualStyle: 'full_bleed_image', overlayPlacement: 'center', textAmount: 'medium', focus: 'Detail' },
        { order: 4, role: 'cta', visualStyle: 'text_panel', overlayPlacement: 'full', textAmount: 'medium', focus: 'CTA' },
      ],
      confidence: 0.81,
      notes: ['Approximate motion with still frames.'],
    },
    template: {
      id: 'reference-video-fast',
      name: 'Reference Video Reel Match',
      reference: 'reference-video-fast',
      outputFormat: 'mp4',
      width: 1080,
      height: 1920,
      imageCount: 3,
      categoryKeys: ['reel', 'video_reference'],
      fps: 30,
      transition: {
        type: 'fade',
        durationMs: 500,
      },
      frames: [
        {
          durationMs: 1800,
          background: { type: 'solid', color: '#111111' },
          layers: [],
        },
        {
          durationMs: 1800,
          background: { type: 'solid', color: '#222222' },
          layers: [],
        },
        {
          durationMs: 1800,
          background: { type: 'solid', color: '#333333' },
          layers: [],
        },
        {
          durationMs: 2200,
          background: { type: 'solid', color: '#444444' },
          layers: [],
        },
      ],
    },
  }));

  try {
    await withServer(async (baseUrl) => {
      const formData = new FormData();
      formData.append('prompt', 'match the strong opening beat');
      formData.append('referenceVideo', new Blob(['fake video bytes'], { type: 'video/quicktime' }), 'sample.mov');

      const res = await fetch(`${baseUrl}/api/design/video`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 200);
      const data = await res.json() as {
        analysis: { pacing: string; majorSceneCount: number };
        template: { outputFormat: string; frames: Array<unknown> };
        previewBase64: string;
        previewKind: string;
      };

      assert.equal(data.analysis.pacing, 'fast');
      assert.equal(data.analysis.majorSceneCount, 4);
      assert.equal(data.template.outputFormat, 'mp4');
      assert.equal(data.template.frames.length, 4);
      assert.match(data.previewBase64, /^data:image\/png;base64,/);
      assert.match(data.previewKind, /image|video/);
    });
  } finally {
    setGenerateReferenceVideoTemplateForTests(null);
  }
});

test('HTTP design/video route rejects unsupported upload formats', async () => {
  await withServer(async (baseUrl) => {
    const formData = new FormData();
    formData.append('referenceVideo', new Blob(['not a video'], { type: 'text/plain' }), 'notes.txt');

    const res = await fetch(`${baseUrl}/api/design/video`, {
      method: 'POST',
      body: formData,
    });

    assert.equal(res.status, 415);
    const data = await res.json() as { error: string };
    assert.match(data.error, /MP4 or MOV/i);
  });
});

test('HTTP design/video/compare-iterate can review a generated preview and return an improved reel template', async () => {
  setCompareAndIterateReferenceVideoForTests(async () => ({
    score: 7,
    feedback: 'The generated reel still needs a stronger CTA ending and tighter scene pacing.',
    shouldContinue: true,
    changesApplied: 'Reduced frame count and strengthened the end card treatment.',
    analysis: {
      orientation: 'portrait',
      aspectRatio: '9:16',
      durationBucket: 'short',
      pacing: 'punchy',
      majorSceneCount: 5,
      headlineTextDensity: 'medium',
      overlayTreatment: 'dark_panel',
      ctaTreatment: 'button_end_card',
      colorDirection: {
        mood: 'bold and modern',
        dominantHex: '#10151D',
        secondaryHex: '#29415B',
        accentHex: '#4E8FE8',
        contrast: 'high',
      },
      slideshowBlueprint: {
        recommendedFrameCount: 5,
        transition: 'fade',
        openingStyle: 'strong hook',
        closingStyle: 'direct CTA',
      },
      scenes: [
        { order: 1, role: 'hook', visualStyle: 'text_panel', overlayPlacement: 'center', textAmount: 'medium', focus: 'Hook' },
        { order: 2, role: 'proof', visualStyle: 'full_bleed_image', overlayPlacement: 'bottom', textAmount: 'light', focus: 'Proof' },
        { order: 3, role: 'detail', visualStyle: 'full_bleed_image', overlayPlacement: 'center', textAmount: 'medium', focus: 'Detail' },
        { order: 4, role: 'offer', visualStyle: 'split_image', overlayPlacement: 'bottom', textAmount: 'medium', focus: 'Offer' },
        { order: 5, role: 'cta', visualStyle: 'logo_end_card', overlayPlacement: 'full', textAmount: 'light', focus: 'CTA' },
      ],
      confidence: 0.84,
      notes: ['Closer pacing, stronger CTA ending.'],
    },
    template: {
      id: 'reference-video-portrait-punchy',
      name: 'Reference Video Reel Match',
      reference: 'reference-video-portrait-punchy',
      outputFormat: 'mp4',
      width: 1080,
      height: 1920,
      imageCount: 4,
      categoryKeys: ['reel', 'video_reference'],
      fps: 30,
      transition: { type: 'fade', durationMs: 350 },
      frames: [
        { durationMs: 1500, background: { type: 'solid', color: '#111111' }, layers: [] },
        { durationMs: 1500, background: { type: 'solid', color: '#222222' }, layers: [] },
        { durationMs: 1500, background: { type: 'solid', color: '#333333' }, layers: [] },
        { durationMs: 1500, background: { type: 'solid', color: '#444444' }, layers: [] },
        { durationMs: 2000, background: { type: 'solid', color: '#555555' }, layers: [] },
      ],
    },
    previewBase64: 'data:image/png;base64,preview',
    previewPosterBase64: 'data:image/png;base64,preview',
    previewKind: 'image',
    frameIndex: 0,
  }));

  try {
    await withServer(async (baseUrl) => {
      const formData = new FormData();
      formData.append('referenceVideo', new Blob(['fake video bytes'], { type: 'video/mp4' }), 'sample.mp4');
      formData.append('existingTemplate', JSON.stringify({
        id: 'test-reel',
        name: 'Test Reel',
        reference: 'test-reel',
        outputFormat: 'mp4',
        width: 1080,
        height: 1920,
        imageCount: 3,
        categoryKeys: ['reel'],
        fps: 30,
        frames: [
          { durationMs: 1500, background: { type: 'solid', color: '#111111' }, layers: [] },
          { durationMs: 1500, background: { type: 'solid', color: '#222222' }, layers: [] },
          { durationMs: 1800, background: { type: 'solid', color: '#333333' }, layers: [] },
        ],
        transition: { type: 'fade', durationMs: 500 },
      }));
      formData.append('previewVideoUrl', 'https://example.com/generated-preview.mp4');
      formData.append('iterationHistory', JSON.stringify([]));
      formData.append('iterationNumber', '1');
      formData.append('maxIterations', '5');
      formData.append('feedback', 'Make the CTA ending stronger');

      const res = await fetch(`${baseUrl}/api/design/video/compare-iterate`, {
        method: 'POST',
        body: formData,
      });

      assert.equal(res.status, 200);
      const data = await res.json() as {
        score: number;
        shouldContinue: boolean;
        changesApplied: string;
        analysis?: { pacing: string };
        template?: { outputFormat: string; frames: Array<unknown> };
      };

      assert.equal(data.score, 7);
      assert.equal(data.shouldContinue, true);
      assert.match(data.changesApplied, /end card/i);
      assert.equal(data.analysis?.pacing, 'punchy');
      assert.equal(data.template?.outputFormat, 'mp4');
      assert.equal(data.template?.frames.length, 5);
    });
  } finally {
    setCompareAndIterateReferenceVideoForTests(null);
  }
});
