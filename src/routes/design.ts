import { Router } from 'express';
import type { DesignRequest, DesignResponse, RenderVariables } from '../types.js';
import { generateTemplate, iterateTemplate } from '../services/claude.js';
import { renderPng } from '../engine/png-renderer.js';
import { saveTemplate } from '../templates/registry.js';

export const designRouter = Router();

// Sample data for design previews
const PREVIEW_VARIABLES: RenderVariables = {
  title: 'Professional Service Completed',
  subtitle: 'Quality workmanship delivered on time and within budget',
  body: 'Sample body text for preview.',
  phone: '(021) 555-1234',
  service_areas: 'Cape Town \u2022 Northern Suburbs \u2022 Southern Suburbs',
  primary_colour: '#235BAA',
  secondary_colour: '#4582D0',
  logo_url: '',
  user_images: [],
  company_name: 'Sample Company',
  website: 'https://example.co.za',
};

/**
 * POST /api/design
 * Generate a new template from a natural language prompt.
 * Returns the template JSON + a base64 preview image.
 */
designRouter.post('/', async (req, res) => {
  const { prompt, width, height } = req.body as DesignRequest;

  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  try {
    const template = await generateTemplate(prompt, width, height);

    // Render a preview with sample data
    const previewBuffer = renderPng({
      template,
      variables: PREVIEW_VARIABLES,
      userImages: [],
      logoImage: null,
    });

    const previewBase64 = `data:image/png;base64,${previewBuffer.toString('base64')}`;

    const response: DesignResponse = {
      template,
      previewBase64,
    };

    res.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design] Generation error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * POST /api/design/iterate
 * Refine an existing template based on feedback.
 */
designRouter.post('/iterate', async (req, res) => {
  const { prompt, existingTemplate } = req.body as DesignRequest;

  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  if (!existingTemplate) {
    res.status(400).json({ error: 'existingTemplate is required for iteration' });
    return;
  }

  try {
    const template = await iterateTemplate(prompt, existingTemplate);

    // Render a preview
    const previewBuffer = renderPng({
      template,
      variables: PREVIEW_VARIABLES,
      userImages: [],
      logoImage: null,
    });

    const previewBase64 = `data:image/png;base64,${previewBuffer.toString('base64')}`;

    const response: DesignResponse = {
      template,
      previewBase64,
    };

    res.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design] Iteration error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * POST /api/design/save
 * Save a designed template to the registry for reuse.
 */
designRouter.post('/save', (req, res) => {
  const { template } = req.body as { template: DesignResponse['template'] };

  if (!template || !template.id || !template.frames) {
    res.status(400).json({ error: 'Valid template with id and frames is required' });
    return;
  }

  saveTemplate(template);
  res.json({ success: true, id: template.id });
});
