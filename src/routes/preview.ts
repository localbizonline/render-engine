import { Router } from 'express';
import { getTemplate } from '../templates/registry.js';
import { templateSchema } from '../templates/schema.js';
import { renderPng } from '../engine/png-renderer.js';
import { loadRemoteImage } from '../engine/asset-loader.js';
import type { RenderVariables, TemplateDefinition } from '../types.js';

export const previewRouter = Router();

// Sample data for previews
const SAMPLE_VARIABLES: RenderVariables = {
  title: 'Professional Service Completed',
  subtitle: 'Quality workmanship delivered on time and within budget',
  body: 'Sample post body text for preview purposes.',
  phone: '(021) 555-1234',
  service_areas: 'Cape Town \u2022 Northern Suburbs \u2022 Southern Suburbs',
  primary_colour: '#235BAA',
  secondary_colour: '#4582D0',
  logo_url: '',
  user_images: [],
  company_name: 'Sample Company',
  website: 'https://example.co.za',
};

previewRouter.post('/', async (req, res) => {
  const { templateId, templateJson, variables } = req.body as {
    templateId?: string;
    templateJson?: TemplateDefinition;
    variables?: Partial<RenderVariables>;
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

  const mergedVars: RenderVariables = { ...SAMPLE_VARIABLES, ...variables };

  // Load logo if provided
  let logoImage = null;
  if (mergedVars.logo_url) {
    logoImage = await loadRemoteImage(mergedVars.logo_url).catch(() => null);
  }

  // Load user images if provided
  const userImages = [];
  for (const url of mergedVars.user_images) {
    if (url) {
      const img = await loadRemoteImage(url).catch(() => null);
      if (img) userImages.push(img);
    }
  }

  const buffer = renderPng({
    template,
    variables: mergedVars,
    userImages,
    logoImage,
  });

  const base64 = buffer.toString('base64');
  res.json({
    previewBase64: `data:image/png;base64,${base64}`,
    templateId: template.id,
    width: template.width,
    height: template.height,
  });
});
