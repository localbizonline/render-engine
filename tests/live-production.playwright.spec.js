import { test, expect } from '@playwright/test';

test('live production designer exposes the shipped visual editor assets', async ({ page }) => {
  const requestFailures = [];

  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      error: request.failure()?.errorText || 'unknown',
    });
  });

  await page.goto('https://render-engine-production.up.railway.app/designer', {
    waitUntil: 'networkidle',
    timeout: 120000,
  });

  await expect(page).toHaveTitle(/Template Lab Designer/i);

  // Phase 1-3 redesign: topbar progress, preview tabs, sticky approve footer
  await expect(page.locator('#topbarProgress')).toBeVisible();
  await expect(page.locator('#previewTabView')).toBeVisible();
  await expect(page.locator('#previewTabEdit')).toBeVisible();
  await expect(page.locator('#previewTabCompare')).toBeVisible();
  await expect(page.locator('#approveFooter')).toBeVisible();

  // Canvas editor controls live inside the preview-edit panel which is hidden
  // until the Edit tab is active. Switch to Edit mode before asserting them.
  await page.locator('#previewTabEdit').click();
  await expect(page.locator('#btnUploadCanvasAsset')).toBeVisible();
  await expect(page.locator('#btnCanvasUndo')).toBeVisible();
  await expect(page.locator('#btnCanvasRedo')).toBeVisible();
  await expect(page.locator('#btnCanvasLayerUp')).toBeVisible();
  await expect(page.locator('#canvasAssetUploadInput')).toHaveCount(1);

  const checks = await page.evaluate(async () => {
    const canvasRes = await fetch('/designer-canvas-editor.js');
    const konvaRes = await fetch('/vendor/konva.min.js');
    const canvasJs = await canvasRes.text();
    const konvaJs = await konvaRes.text();

    return {
      hasUploadPng: document.body.innerText.includes('Upload PNG'),
      hasUndo: Boolean(document.querySelector('#btnCanvasUndo')),
      hasRedo: Boolean(document.querySelector('#btnCanvasRedo')),
      canvasStatus: canvasRes.status,
      konvaStatus: konvaRes.status,
      canvasHasFactory: canvasJs.includes('createTemplateLabCanvasEditor'),
      canvasHasUploadMessage: canvasJs.includes('Uploaded a decorative transparent PNG asset to the frame.'),
      canvasHasSnapping: canvasJs.includes('applySnapping'),
      konvaHasSymbol: konvaJs.includes('Konva'),
    };
  });

  expect(checks.hasUploadPng).toBe(true);
  expect(checks.hasUndo).toBe(true);
  expect(checks.hasRedo).toBe(true);
  expect(checks.canvasStatus).toBe(200);
  expect(checks.konvaStatus).toBe(200);
  expect(checks.canvasHasFactory).toBe(true);
  expect(checks.canvasHasUploadMessage).toBe(true);
  expect(checks.canvasHasSnapping).toBe(true);
  expect(checks.konvaHasSymbol).toBe(true);

  const relevantFailures = requestFailures.filter((entry) =>
    entry.url.includes('render-engine-production.up.railway.app/designer') ||
    entry.url.includes('/designer-canvas-editor.js') ||
    entry.url.includes('/vendor/konva.min.js'),
  );

  expect(relevantFailures).toEqual([]);

  await page.screenshot({
    path: '/tmp/render-engine-live-designer-playwright.png',
    fullPage: true,
  });
});
