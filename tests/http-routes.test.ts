import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';

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
    const [designerRes, designerHtmlRes] = await Promise.all([
      fetch(`${baseUrl}/designer`),
      fetch(`${baseUrl}/designer.html`),
    ]);

    assert.equal(designerRes.status, 200);
    assert.equal(designerHtmlRes.status, 200);
    assert.match(designerRes.headers.get('content-type') || '', /text\/html/i);
    assert.match(designerHtmlRes.headers.get('content-type') || '', /text\/html/i);

    const [designerHtml, designerHtmlAlias] = await Promise.all([
      designerRes.text(),
      designerHtmlRes.text(),
    ]);

    assert.equal(designerHtml, designerHtmlAlias);
    assert.match(designerHtml, /<title>Template Lab Designer<\/title>/);
    assert.match(designerHtml, /<script src="\/designer-v2-bridge\.js"><\/script>/);
    assert.match(designerHtml, /<script src="\/designer-app\.js"><\/script>/);
    assert.match(designerHtml, /id="btnCopyV2TemplateId"/);
    assert.match(designerHtml, /id="btnCopyV2ExportUrl"/);
  });
});

test('HTTP routes serve the extracted Template Lab scripts as JavaScript assets', async () => {
  await withServer(async (baseUrl) => {
    const [bridgeRes, appRes] = await Promise.all([
      fetch(`${baseUrl}/designer-v2-bridge.js`),
      fetch(`${baseUrl}/designer-app.js`),
    ]);

    assert.equal(bridgeRes.status, 200);
    assert.equal(appRes.status, 200);

    const [bridgeSource, appSource] = await Promise.all([
      bridgeRes.text(),
      appRes.text(),
    ]);

    assert.doesNotMatch(bridgeSource, /<!DOCTYPE html>/i);
    assert.doesNotMatch(appSource, /<!DOCTYPE html>/i);
    assert.match(bridgeSource, /function createTemplateLabV2Bridge/);
    assert.match(appSource, /async function approveTemplateForV2/);
    assert.match(appSource, /btnCopyV2TemplateId/);
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
    assert.ok(templates.templates.some((template) => template.id === 'main-1-image'));
  });
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
