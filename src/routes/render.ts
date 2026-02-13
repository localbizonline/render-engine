import { Router } from 'express';
import type { RenderRequest, RenderResponse } from '../types.js';
import { getTemplateByAirtableId, getTemplate, autoSelectTemplate } from '../templates/registry.js';
import { renderPng } from '../engine/png-renderer.js';
import { renderMp4 } from '../engine/mp4-renderer.js';
import { loadRemoteImage } from '../engine/asset-loader.js';
import { uploadRender } from '../services/r2-storage.js';
import { getPostBuilderRecord, updateRenderResult, getTestRecord, updateTestResult } from '../services/airtable.js';

export const renderRouter = Router();

renderRouter.post('/sync', async (req, res) => {
  const start = Date.now();
  const body = req.body as RenderRequest;

  if (!body.recordId) {
    res.status(400).json({ success: false, error: 'recordId is required' });
    return;
  }

  try {
    // 1. Fetch record from Airtable
    const record = await getPostBuilderRecord(body.recordId);

    // 2. Skip-render guards — these post types don't need image generation
    if (record.is_text_only) {
      console.log(`[render] Skipping ${body.recordId}: is_text_only`);
      res.json({ success: true, skipped: true, reason: 'is_text_only' });
      return;
    }
    if (record.upload_as_gallery) {
      console.log(`[render] Skipping ${body.recordId}: upload_as_gallery`);
      res.json({ success: true, skipped: true, reason: 'upload_as_gallery' });
      return;
    }
    if (record.is_user_uploaded_video) {
      console.log(`[render] Skipping ${body.recordId}: is_user_uploaded_video`);
      res.json({ success: true, skipped: true, reason: 'is_user_uploaded_video' });
      return;
    }

    // 3. Resolve template
    const templateId = body.templateId || record.template_id;
    let template = templateId ? getTemplateByAirtableId(templateId) : undefined;

    // Fallback: try as a built-in ID directly
    if (!template && templateId) {
      template = getTemplate(templateId);
    }

    // Auto-select if no template specified or found
    if (!template) {
      const imageCount = record.user_images.filter(Boolean).length;
      const preferMp4 = record.output_format === 'mp4' || record.post_type === 'slideshow';
      const categoryKeys = record.post_category_key ? [record.post_category_key] : undefined;
      template = await autoSelectTemplate(imageCount, body.recordId, categoryKeys, preferMp4, record.post_type, record.company_id);
      if (template) {
        console.log(`[render] Auto-selected template "${template.id}" for ${body.recordId} (${imageCount} images, postType=${record.post_type || 'none'}, category=${record.post_category_key || 'none'})`);
      }
    }

    if (!template) {
      const response: RenderResponse = {
        success: false,
        error: `Template not found for ID: ${templateId}`,
      };
      await updateRenderResult(body.recordId, {
        outputUrl: '',
        outputFormat: 'png',
        status: 'failed',
        error: response.error,
      });
      res.status(404).json(response);
      return;
    }

    // 4. Load images in parallel
    const imageUrls = record.user_images.filter(Boolean);
    const imagePromises = imageUrls.map((url) => loadRemoteImage(url).catch(() => null));
    const logoPromise = record.logo_url
      ? loadRemoteImage(record.logo_url).catch(() => null)
      : Promise.resolve(null);
    const squareCtaPromise = record.square_cta_image_url
      ? loadRemoteImage(record.square_cta_image_url).catch(() => null)
      : Promise.resolve(null);
    const landscapeCtaPromise = record.landscape_cta_image_url
      ? loadRemoteImage(record.landscape_cta_image_url).catch(() => null)
      : Promise.resolve(null);

    const [loadedImages, logoImage, squareCtaImage, landscapeCtaImage] = await Promise.all([
      Promise.all(imagePromises),
      logoPromise,
      squareCtaPromise,
      landscapeCtaPromise,
    ]);

    const userImages = loadedImages.filter((img): img is NonNullable<typeof img> => img !== null);

    // 5. Render
    let outputBuffer: Buffer;
    let outputFormat: 'png' | 'mp4';

    const renderVars = {
      title: record.content_title,
      subtitle: record.content_subtitle,
      body: record.content_body,
      phone: record.phone,
      service_areas: record.service_areas,
      primary_colour: record.primary_colour,
      secondary_colour: record.secondary_colour,
      logo_url: record.logo_url,
      user_images: record.user_images,
      company_name: record.company_name,
      website: record.website,
      square_cta_image_url: record.square_cta_image_url,
      landscape_cta_image_url: record.landscape_cta_image_url,
    };

    if (template.outputFormat === 'mp4') {
      outputBuffer = await renderMp4({
        template,
        variables: renderVars,
        userImages,
        logoImage,
        squareCtaImage,
        landscapeCtaImage,
      });
      outputFormat = 'mp4';
    } else {
      outputBuffer = renderPng({
        template,
        variables: renderVars,
        userImages,
        logoImage,
        squareCtaImage,
        landscapeCtaImage,
      });
      outputFormat = 'png';
    }

    // 6. Upload to R2
    const filename = `renders/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${body.recordId}_${Date.now()}.${outputFormat === 'png' ? 'png' : 'mp4'}`;
    const contentType = outputFormat === 'png' ? 'image/png' : 'video/mp4';
    const outputUrl = await uploadRender(outputBuffer, filename, contentType);

    // 7. Update Airtable
    await updateRenderResult(body.recordId, {
      outputUrl,
      outputFormat,
      status: 'completed',
    });

    const renderTimeMs = Date.now() - start;
    const response: RenderResponse = {
      success: true,
      outputUrl,
      outputFormat,
      templateUsed: template.id,
      renderTimeMs,
    };

    console.log(`[render] ${body.recordId} rendered in ${renderTimeMs}ms → ${outputUrl}`);
    res.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[render] Error rendering ${body.recordId}:`, errMsg);

    await updateRenderResult(body.recordId, {
      outputUrl: '',
      outputFormat: 'png',
      status: 'failed',
      error: errMsg,
    }).catch(() => {});

    res.status(500).json({ success: false, error: errMsg });
  }
});

/**
 * POST /api/render/test
 * Render from the render_engine_test table (safe for testing).
 * Uses simple field names instead of field IDs.
 */
renderRouter.post('/test', async (req, res) => {
  const start = Date.now();
  const { recordId } = req.body as { recordId: string };

  if (!recordId) {
    res.status(400).json({ success: false, error: 'recordId is required' });
    return;
  }

  try {
    const record = await getTestRecord(recordId);

    // Resolve template (test table uses built-in IDs directly)
    let template = record.template_id ? getTemplate(record.template_id) : undefined;

    // Auto-select if no template specified
    if (!template) {
      const imageCount = record.user_images.filter(Boolean).length;
      template = await autoSelectTemplate(imageCount, recordId);
      if (template) {
        console.log(`[render/test] Auto-selected template "${template.id}" for ${recordId} (${imageCount} images)`);
      }
    }

    if (!template) {
      res.status(404).json({ success: false, error: `Template not found: ${record.template_id}` });
      return;
    }

    // Load images in parallel (including CTA images)
    const imageUrls = record.user_images.filter(Boolean);
    const imagePromises = imageUrls.map((url) => loadRemoteImage(url).catch(() => null));
    const logoPromise = record.logo_url
      ? loadRemoteImage(record.logo_url).catch(() => null)
      : Promise.resolve(null);
    const squareCtaPromise = record.square_cta_image_url
      ? loadRemoteImage(record.square_cta_image_url).catch(() => null)
      : Promise.resolve(null);
    const landscapeCtaPromise = record.landscape_cta_image_url
      ? loadRemoteImage(record.landscape_cta_image_url).catch(() => null)
      : Promise.resolve(null);

    const [loadedImages, logoImage, squareCtaImage, landscapeCtaImage] = await Promise.all([
      Promise.all(imagePromises),
      logoPromise,
      squareCtaPromise,
      landscapeCtaPromise,
    ]);
    const userImages = loadedImages.filter((img): img is NonNullable<typeof img> => img !== null);

    const renderVars = {
      title: record.content_title,
      subtitle: record.content_subtitle,
      body: record.content_body,
      phone: record.phone,
      service_areas: record.service_areas,
      primary_colour: record.primary_colour,
      secondary_colour: record.secondary_colour,
      logo_url: record.logo_url,
      user_images: record.user_images,
      company_name: record.company_name,
      website: record.website,
      square_cta_image_url: record.square_cta_image_url,
      landscape_cta_image_url: record.landscape_cta_image_url,
    };

    let outputBuffer: Buffer;
    let outputFormat: 'png' | 'mp4';

    if (template.outputFormat === 'mp4') {
      outputBuffer = await renderMp4({ template, variables: renderVars, userImages, logoImage, squareCtaImage, landscapeCtaImage });
      outputFormat = 'mp4';
    } else {
      outputBuffer = renderPng({ template, variables: renderVars, userImages, logoImage, squareCtaImage, landscapeCtaImage });
      outputFormat = 'png';
    }

    const filename = `test-renders/${recordId}_${Date.now()}.${outputFormat}`;
    const contentType = outputFormat === 'png' ? 'image/png' : 'video/mp4';
    const outputUrl = await uploadRender(outputBuffer, filename, contentType);

    // Update test table
    await updateTestResult(recordId, { outputUrl, status: 'completed' });

    const renderTimeMs = Date.now() - start;
    console.log(`[render/test] ${recordId} rendered in ${renderTimeMs}ms → ${outputUrl}`);
    res.json({ success: true, outputUrl, outputFormat, templateUsed: template.id, renderTimeMs });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[render/test] Error:`, errMsg);
    await updateTestResult(recordId, { outputUrl: '', status: `failed: ${errMsg}` }).catch(() => {});
    res.status(500).json({ success: false, error: errMsg });
  }
});
