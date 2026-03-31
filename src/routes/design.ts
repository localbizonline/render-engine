import { Router } from 'express';
import type {
  DesignRequest,
  DesignResponse,
  VisionDesignRequest,
  VisionIterateRequest,
  VisionCompareRequest,
  CompareAndIterateRequest,
} from '../types.js';
import {
  generateTemplate,
  iterateTemplate,
  generateTemplateFromImage,
  iterateTemplateFromImage,
  compareDesigns,
  compareAndIterate,
} from '../services/claude.js';
import { renderTemplatePreview } from '../services/template-preview.js';
import { saveTemplate } from '../templates/registry.js';

export const designRouter = Router();

// ── Helper: parse data URI ──

function parseDataUri(dataUri: string): { base64: string; mediaType: string } {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid data URI format');
  return { mediaType: match[1], base64: match[2] };
}

async function renderPreview(template: import('../types.js').TemplateDefinition): Promise<string> {
  const { previewBase64 } = await renderTemplatePreview(template);
  return previewBase64;
}

// ── Vision-based design endpoints (Claude CLI via Max subscription) ──

/**
 * POST /api/design/vision
 * Generate a template from a reference image using Claude Vision.
 */
designRouter.post('/vision', async (req, res) => {
  const { referenceImage, prompt, width, height } = req.body as VisionDesignRequest;

  if (!referenceImage) {
    res.status(400).json({ error: 'referenceImage is required (data URI)' });
    return;
  }

  try {
    const { base64, mediaType } = parseDataUri(referenceImage);
    const template = await generateTemplateFromImage(base64, mediaType, prompt || '', width, height);
    const previewBase64 = await renderPreview(template);

    res.json({ template, previewBase64 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design/vision] Generation error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * POST /api/design/vision/iterate
 * Iterate a template by comparing reference to current preview.
 */
designRouter.post('/vision/iterate', async (req, res) => {
  const { referenceImage, previewImage, feedback, existingTemplate } = req.body as VisionIterateRequest;

  if (!referenceImage || !previewImage || !feedback || !existingTemplate) {
    res.status(400).json({ error: 'referenceImage, previewImage, feedback, and existingTemplate are all required' });
    return;
  }

  try {
    const ref = parseDataUri(referenceImage);
    const prev = parseDataUri(previewImage);
    const template = await iterateTemplateFromImage(
      ref.base64, ref.mediaType,
      prev.base64,
      feedback,
      existingTemplate,
    );
    const previewBase64 = await renderPreview(template);

    res.json({ template, previewBase64 });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design/vision] Iteration error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * POST /api/design/vision/compare
 * Compare reference image to current preview and rate similarity.
 */
designRouter.post('/vision/compare', async (req, res) => {
  const { referenceImage, previewImage, currentTemplate } = req.body as VisionCompareRequest;

  if (!referenceImage || !previewImage || !currentTemplate) {
    res.status(400).json({ error: 'referenceImage, previewImage, and currentTemplate are all required' });
    return;
  }

  try {
    const ref = parseDataUri(referenceImage);
    const prev = parseDataUri(previewImage);
    const result = await compareDesigns(ref.base64, ref.mediaType, prev.base64, currentTemplate);

    res.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design/vision] Compare error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * POST /api/design/vision/compare-iterate
 * Combined compare + iterate in a single CLI call.
 * Scores the current preview against reference, then produces an updated template.
 * Accepts iteration history for context accumulation across the loop.
 */
designRouter.post('/vision/compare-iterate', async (req, res) => {
  const {
    referenceImage,
    previewImage,
    existingTemplate,
    iterationHistory,
    iterationNumber,
    maxIterations,
    plateauWarning,
  } = req.body as CompareAndIterateRequest;

  if (!referenceImage || !previewImage || !existingTemplate) {
    res.status(400).json({ error: 'referenceImage, previewImage, and existingTemplate are required' });
    return;
  }

  try {
    const ref = parseDataUri(referenceImage);
    const prev = parseDataUri(previewImage);

    const result = await compareAndIterate(
      ref.base64, ref.mediaType,
      prev.base64,
      existingTemplate,
      iterationHistory || [],
      iterationNumber || 1,
      maxIterations || 8,
      plateauWarning || false,
    );

    // If template was updated, render a preview
    if (result.template) {
      result.previewBase64 = await renderPreview(result.template);
    }

    res.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design/vision] Compare+iterate error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

// ── Text-based design endpoints (Anthropic SDK) ──

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
    const previewBase64 = await renderPreview(template);

    const response: DesignResponse = { template, previewBase64 };
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
    const previewBase64 = await renderPreview(template);

    const response: DesignResponse = { template, previewBase64 };
    res.json(response);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design] Iteration error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

/**
 * POST /api/design/save
 * Save a designed template to the local in-memory registry.
 */
designRouter.post('/save', async (req, res) => {
  const {
    template,
  } = req.body as {
    template: DesignResponse['template'];
  };

  if (!template || !template.id || !template.frames) {
    res.status(400).json({ error: 'Valid template with id and frames is required' });
    return;
  }

  // Save to in-memory registry
  saveTemplate(template);

  res.json({
    success: true,
    id: template.id,
  });
});
