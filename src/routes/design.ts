import { Router } from 'express';
import multer from 'multer';
import type {
  CompareAndIterateRequest,
  DesignRequest,
  DesignResponse,
  ReferenceVideoAnalysis,
  VideoCompareIterateRequest,
  VideoCompareIterateResponse,
  VideoDesignResponse,
  VisionDesignRequest,
  VisionIterateRequest,
  VisionCompareRequest,
} from '../types.js';
import {
  generateTemplate,
  iterateTemplate,
  generateTemplateFromImage,
  iterateTemplateFromImage,
  compareDesigns,
  compareAndIterate,
} from '../services/claude.js';
import { compareAndIterateReferenceVideo, generateTemplateFromReferenceVideo } from '../services/gemini-video.js';
import { renderTemplatePreview } from '../services/template-preview.js';
import { saveTemplate } from '../templates/registry.js';

export const designRouter = Router();

const REFERENCE_VIDEO_UPLOAD_LIMIT_BYTES = 40 * 1024 * 1024;
const supportedReferenceVideoMimeTypes = new Set(['video/mp4', 'video/mov']);

function normalizeReferenceVideoMimeType(mimeType: string | undefined, originalName: string | undefined) {
  const trimmedMimeType = String(mimeType || '').trim().toLowerCase();
  const lowerName = String(originalName || '').toLowerCase();

  if (trimmedMimeType === 'video/mp4' || lowerName.endsWith('.mp4')) {
    return 'video/mp4';
  }
  if (trimmedMimeType === 'video/mov' || trimmedMimeType === 'video/quicktime' || lowerName.endsWith('.mov')) {
    return 'video/mov';
  }

  return trimmedMimeType;
}

const referenceVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: REFERENCE_VIDEO_UPLOAD_LIMIT_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const normalizedMimeType = normalizeReferenceVideoMimeType(file.mimetype, file.originalname);
    if (supportedReferenceVideoMimeTypes.has(normalizedMimeType)) {
      callback(null, true);
      return;
    }

    callback(new Error('Reference video must be an MP4 or MOV file.'));
  },
});

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid JSON field: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ── Helper: parse data URI ──

function parseDataUri(dataUri: string): { base64: string; mediaType: string } {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid data URI format');
  return { mediaType: match[1], base64: match[2] };
}

async function renderPreview(template: import('../types.js').TemplateDefinition) {
  return renderTemplatePreview(template, {}, {
    mode: template.outputFormat === 'mp4' ? 'video' : 'poster',
  });
}

function sendReferenceVideoUploadError(res: import('express').Response, error: unknown) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: `Reference video must be ${Math.round(REFERENCE_VIDEO_UPLOAD_LIMIT_BYTES / (1024 * 1024))}MB or smaller.`,
    });
    return true;
  }

  if (error instanceof Error) {
    const status = /mp4 or mov/i.test(error.message) ? 415 : 400;
    res.status(status).json({ error: error.message });
    return true;
  }

  return false;
}

// ── Vision-based design endpoints (Anthropic API) ──

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
    const preview = await renderPreview(template);

    res.json({ template, ...preview });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[design/vision] Generation error:', errMsg);
    res.status(500).json({ error: errMsg });
  }
});

designRouter.post('/video', (req, res) => {
  referenceVideoUpload.single('referenceVideo')(req, res, async (uploadError) => {
    if (sendReferenceVideoUploadError(res, uploadError)) {
      return;
    }

    const videoFile = req.file;
    if (!videoFile) {
      res.status(400).json({ error: 'referenceVideo is required (multipart file upload)' });
      return;
    }

    const normalizedMimeType = normalizeReferenceVideoMimeType(videoFile.mimetype, videoFile.originalname);
    if (!supportedReferenceVideoMimeTypes.has(normalizedMimeType)) {
      res.status(415).json({ error: 'Reference video must be an MP4 or MOV file.' });
      return;
    }

    try {
      const { template, analysis } = await generateTemplateFromReferenceVideo({
        video: new Blob([new Uint8Array(videoFile.buffer)], { type: normalizedMimeType }),
        mimeType: normalizedMimeType,
        displayName: videoFile.originalname,
        prompt: typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '',
      });
      const preview = await renderPreview(template);

      const response: VideoDesignResponse = {
        analysis,
        template,
        previewBase64: preview.previewBase64,
      };
      Object.assign(response, preview);
      res.json(response);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const statusCode = /not configured/i.test(errMsg) ? 503 : 500;
      console.error('[design/video] Generation error:', errMsg);
      res.status(statusCode).json({ error: errMsg });
    }
  });
});

designRouter.post('/video/compare-iterate', (req, res) => {
  referenceVideoUpload.single('referenceVideo')(req, res, async (uploadError) => {
    if (sendReferenceVideoUploadError(res, uploadError)) {
      return;
    }

    const videoFile = req.file;
    if (!videoFile) {
      res.status(400).json({ error: 'referenceVideo is required (multipart file upload)' });
      return;
    }

    const normalizedMimeType = normalizeReferenceVideoMimeType(videoFile.mimetype, videoFile.originalname);
    if (!supportedReferenceVideoMimeTypes.has(normalizedMimeType)) {
      res.status(415).json({ error: 'Reference video must be an MP4 or MOV file.' });
      return;
    }

    try {
      const request = req.body as Record<string, unknown>;
      const existingTemplate = parseJsonField<VideoCompareIterateRequest['existingTemplate'] | null>(request.existingTemplate, null);
      const iterationHistory = parseJsonField<VideoCompareIterateRequest['iterationHistory']>(request.iterationHistory, []);
      const currentAnalysis = parseJsonField<ReferenceVideoAnalysis | undefined>(request.currentAnalysis, undefined);
      const previewVideoUrl = typeof request.previewVideoUrl === 'string' ? request.previewVideoUrl.trim() : '';
      const previewImage = typeof request.previewImage === 'string' ? request.previewImage.trim() : '';
      const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : '';
      const feedback = typeof request.feedback === 'string' ? request.feedback.trim() : '';
      const iterationNumber = Number.isFinite(Number(request.iterationNumber)) ? Number(request.iterationNumber) : 1;
      const maxIterations = Number.isFinite(Number(request.maxIterations)) ? Number(request.maxIterations) : 8;

      if (!existingTemplate || !existingTemplate.id || !Array.isArray(existingTemplate.frames)) {
        res.status(400).json({ error: 'existingTemplate is required as valid JSON.' });
        return;
      }

      if (!previewVideoUrl && !previewImage) {
        res.status(400).json({ error: 'previewVideoUrl or previewImage is required for video review.' });
        return;
      }

      const result = await compareAndIterateReferenceVideo({
        video: new Blob([new Uint8Array(videoFile.buffer)], { type: normalizedMimeType }),
        mimeType: normalizedMimeType,
        displayName: videoFile.originalname,
        generatedPreviewVideoUrl: previewVideoUrl || undefined,
        generatedPreviewPosterDataUri: previewImage || undefined,
        existingTemplate,
        iterationHistory: Array.isArray(iterationHistory) ? iterationHistory : [],
        iterationNumber,
        maxIterations,
        feedback: feedback || undefined,
        prompt: prompt || undefined,
        currentAnalysis,
      });

      const response: VideoCompareIterateResponse = {
        score: result.score,
        feedback: result.feedback,
        shouldContinue: result.shouldContinue,
        changesApplied: result.changesApplied,
        analysis: result.analysis,
      };

      if (result.template) {
        const preview = await renderPreview(result.template);
        Object.assign(response, preview, { template: result.template });
      }

      res.json(response);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const statusCode = /not configured/i.test(errMsg) ? 503 : /Invalid JSON field/i.test(errMsg) ? 400 : 500;
      console.error('[design/video/compare-iterate] Error:', errMsg);
      res.status(statusCode).json({ error: errMsg });
    }
  });
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
    const preview = await renderPreview(template);

    res.json({ template, ...preview });
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
 * Combined compare + iterate in a single API call.
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
      Object.assign(result, await renderPreview(result.template));
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
    const preview = await renderPreview(template);

    const response: DesignResponse = { template, previewBase64: preview.previewBase64 };
    Object.assign(response, preview);
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
    const preview = await renderPreview(template);

    const response: DesignResponse = { template, previewBase64: preview.previewBase64 };
    Object.assign(response, preview);
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
