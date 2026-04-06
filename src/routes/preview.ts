import { Router } from 'express';
import { getTemplate } from '../templates/registry.js';
import { templateSchema } from '../templates/schema.js';
import type { RenderVariables, TemplateDefinition } from '../types.js';
import { renderTemplatePreview } from '../services/template-preview.js';

export const previewRouter = Router();

previewRouter.post('/', async (req, res) => {
  const { templateId, templateJson, variables } = req.body as {
    templateId?: string;
    templateJson?: TemplateDefinition;
    variables?: Partial<RenderVariables>;
    frameIndex?: number;
    previewMode?: 'poster' | 'video';
  };

  if (!templateId && !templateJson) {
    res.status(400).json({ error: 'templateId or templateJson is required' });
    return;
  }

  let template: TemplateDefinition | undefined;

  if (templateJson) {
    // Validate inline template JSON
    const result = templateSchema.safeParse(templateJson);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid templateJson', details: result.error.issues });
      return;
    }
    template = result.data as TemplateDefinition;
  } else if (templateId) {
    template = getTemplate(templateId);
  }

  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const requestedFrameIndex = Number.isInteger(req.body?.frameIndex) ? Number(req.body.frameIndex) : undefined;
  const previewMode = req.body?.previewMode === 'video' ? 'video' : 'poster';
  const preview = await renderTemplatePreview(template, variables as Partial<RenderVariables>, {
    frameIndex: requestedFrameIndex,
    mode: previewMode,
  });

  res.json({
    previewBase64: preview.previewBase64,
    previewPosterBase64: preview.previewPosterBase64,
    previewKind: preview.previewKind,
    previewUrl: preview.previewUrl,
    previewWarning: preview.previewWarning,
    templateId: template.id,
    frameIndex: preview.frameIndex,
    width: template.width,
    height: template.height,
  });
});
