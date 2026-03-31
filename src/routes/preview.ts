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
  const templateForPreview = requestedFrameIndex == null
    ? template
    : { ...template, frames: [template.frames[requestedFrameIndex] ?? template.frames[0]] };
  const { previewBase64 } = await renderTemplatePreview(templateForPreview, variables as Partial<RenderVariables>);

  res.json({
    previewBase64,
    templateId: template.id,
    frameIndex: requestedFrameIndex ?? 0,
    width: template.width,
    height: template.height,
  });
});
