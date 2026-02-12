import { Router } from 'express';
import type { RenderRequest, RenderResponse } from '../types.js';
import { getTemplateByAirtableId, getTemplate } from '../templates/registry.js';
import { renderPng } from '../engine/png-renderer.js';
import { renderMp4 } from '../engine/mp4-renderer.js';
import { loadRemoteImage } from '../engine/asset-loader.js';
import { uploadRender } from '../services/r2-storage.js';
import { getPostBuilderRecord, updateRenderResult } from '../services/airtable.js';

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

    // 2. Resolve template
    const templateId = body.templateId || record.template_id;
    let template = templateId ? getTemplateByAirtableId(templateId) : undefined;

    // Fallback: try as a built-in ID directly
    if (!template && templateId) {
      template = getTemplate(templateId);
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

    // 3. Load images in parallel
    const imageUrls = record.user_images.filter(Boolean);
    const imagePromises = imageUrls.map((url) => loadRemoteImage(url).catch(() => null));
    const logoPromise = record.logo_url
      ? loadRemoteImage(record.logo_url).catch(() => null)
      : Promise.resolve(null);

    const [loadedImages, logoImage] = await Promise.all([
      Promise.all(imagePromises),
      logoPromise,
    ]);

    const userImages = loadedImages.filter((img): img is NonNullable<typeof img> => img !== null);

    // 4. Render
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
    };

    if (template.outputFormat === 'mp4') {
      outputBuffer = await renderMp4({
        template,
        variables: renderVars,
        userImages,
        logoImage,
      });
      outputFormat = 'mp4';
    } else {
      outputBuffer = renderPng({
        template,
        variables: renderVars,
        userImages,
        logoImage,
      });
      outputFormat = 'png';
    }

    // 5. Upload to R2
    const filename = `renders/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${body.recordId}_${Date.now()}.${outputFormat === 'png' ? 'png' : 'mp4'}`;
    const contentType = outputFormat === 'png' ? 'image/png' : 'video/mp4';
    const outputUrl = await uploadRender(outputBuffer, filename, contentType);

    // 6. Update Airtable
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
