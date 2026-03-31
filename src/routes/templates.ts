import { Router } from 'express';
import { listTemplates, getTemplate, saveTemplate } from '../templates/registry.js';
import type { TemplateDefinition } from '../types.js';

export const templatesRouter = Router();

templatesRouter.get('/', (_req, res) => {
  const templates = listTemplates();
  res.json({
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      outputFormat: template.outputFormat,
      imageCount: template.imageCount,
    })),
  });
});

templatesRouter.get('/managed', (_req, res) => {
  res.status(410).json({
    error: 'Airtable-managed templates have been removed from render-engine. Use social-posting-v2 as the system of record.',
  });
});

templatesRouter.post('/sync', (_req, res) => {
  res.status(410).json({
    error: 'Airtable template sync has been removed from render-engine.',
  });
});

templatesRouter.post('/save-to-airtable', (_req, res) => {
  res.status(410).json({
    error: 'Airtable template saves have been removed from render-engine.',
  });
});

templatesRouter.put('/:recordId/activate', (_req, res) => {
  res.status(410).json({
    error: 'Airtable template activation has been removed from render-engine.',
  });
});

templatesRouter.put('/:recordId/rotation', (_req, res) => {
  res.status(410).json({
    error: 'Airtable template rotation management has been removed from render-engine.',
  });
});

templatesRouter.get('/:id', (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  res.json(template);
});

templatesRouter.post('/', (req, res) => {
  const template = req.body as TemplateDefinition;
  if (!template.id || !template.name || !template.frames) {
    res.status(400).json({ error: 'Invalid template: id, name, and frames are required' });
    return;
  }

  saveTemplate(template);
  res.json({ success: true, id: template.id });
});
