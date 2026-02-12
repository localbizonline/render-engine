import { Router } from 'express';
import { listTemplates, getTemplate, saveTemplate } from '../templates/registry.js';
import type { TemplateDefinition } from '../types.js';

export const templatesRouter = Router();

templatesRouter.get('/', (_req, res) => {
  const templates = listTemplates();
  res.json({ templates: templates.map((t) => ({ id: t.id, name: t.name, outputFormat: t.outputFormat, imageCount: t.imageCount })) });
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
