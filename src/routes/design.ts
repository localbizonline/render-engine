import { Router } from 'express';
import multer from 'multer';
import type {
  DesignRequest,
  DesignResponse,
  ReferenceVideoAnalysis,
  VideoCompareIterateRequest,
  VideoCompareIterateResponse,
  VideoDesignResponse,
} from '../types.js';
import { generateTemplate, iterateTemplate } from '../services/claude.js';
import { compareAndIterateReferenceVideo, generateTemplateFromReferenceVideo } from '../services/gemini-video.js';
import { renderTemplatePreview } from '../services/template-preview.js';
import { saveTemplate } from '../templates/registry.js';

export const designRouter = Router();

const REFERENCE_VIDEO_UPLOAD_LIMIT_BYTES = 40 * 1024 * 1024;
const supportedReferenceVideoMimeTypes = new Set(['video/mp4', 'video/mov']);
const STATIC_IMAGE_AUTHORING_REMOVED_ERROR = 'Static image authoring has been removed. All templates must output MP4.';

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

async function renderPreview(template: import('../types.js').TemplateDefinition) {
  return renderTemplatePreview(template, {}, { mode: 'video' });
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

function rejectStaticImageAuthoring(res: import('express').Response) {
  res.status(400).json({ error: STATIC_IMAGE_AUTHORING_REMOVED_ERROR });
}

function hasUnsupportedDimensions(width?: number, height?: number) {
  if (!width || !height) return false;
  return width * 16 !== height * 9;
}

// ── Reference-video endpoints ─────────────────────────────────────

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

      if (template.outputFormat !== 'mp4') {
        rejectStaticImageAuthoring(res);
        return;
      }

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
      if (existingTemplate.outputFormat !== 'mp4') {
        rejectStaticImageAuthoring(res);
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
        if (result.template.outputFormat !== 'mp4') {
          rejectStaticImageAuthoring(res);
          return;
        }

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

// ── Text prompt endpoints ─────────────────────────────────────────

designRouter.post('/', async (req, res) => {
  const { prompt, width, height } = req.body as DesignRequest;

  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  if (hasUnsupportedDimensions(width, height)) {
    rejectStaticImageAuthoring(res);
    return;
  }

  try {
    const template = await generateTemplate(prompt, width, height);
    if (template.outputFormat !== 'mp4') {
      rejectStaticImageAuthoring(res);
      return;
    }

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
  if (existingTemplate.outputFormat !== 'mp4') {
    rejectStaticImageAuthoring(res);
    return;
  }

  try {
    const template = await iterateTemplate(prompt, existingTemplate);
    if (template.outputFormat !== 'mp4') {
      rejectStaticImageAuthoring(res);
      return;
    }

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

designRouter.post('/save', async (req, res) => {
  const { template } = req.body as { template: DesignResponse['template'] };

  if (!template || !template.id || !template.frames) {
    res.status(400).json({ error: 'Valid template with id and frames is required' });
    return;
  }
  if (template.outputFormat !== 'mp4') {
    rejectStaticImageAuthoring(res);
    return;
  }

  saveTemplate(template);
  res.json({ success: true, id: template.id });
});
