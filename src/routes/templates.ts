import { Router } from 'express';
import {
  listTemplates,
  listTemplatesWithMeta,
  getTemplate,
  saveTemplate,
  refreshRegistry,
  getRotationPool,
} from '../templates/registry.js';
import { saveTemplateToAirtable, updateTemplateField } from '../services/airtable.js';
import type { TemplateDefinition } from '../types.js';

export const templatesRouter = Router();

// ── List all templates ──
templatesRouter.get('/', (_req, res) => {
  const templates = listTemplates();
  res.json({ templates: templates.map((t) => ({ id: t.id, name: t.name, outputFormat: t.outputFormat, imageCount: t.imageCount })) });
});

// ── Management endpoints (before /:id to avoid param capture) ──

/**
 * POST /api/templates/sync
 * Force re-sync templates from Airtable.
 */
templatesRouter.post('/sync', async (_req, res) => {
  try {
    const count = await refreshRegistry();
    res.json({ success: true, syncedTemplates: count });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errMsg });
  }
});

/**
 * GET /api/templates/rotation-pool
 * Show which templates would be in the rotation pool for given criteria.
 * Query params: format (png|mp4), imageCount (number), category (optional)
 */
templatesRouter.get('/rotation-pool', (req, res) => {
  const format = (req.query.format as string) === 'mp4' ? 'mp4' : 'png';
  const imageCount = parseInt(req.query.imageCount as string) || 2;
  const category = req.query.category as string | undefined;
  const categoryKeys = category ? [category] : undefined;

  const pool = getRotationPool(format as 'png' | 'mp4', imageCount, categoryKeys);

  res.json({
    format,
    imageCount,
    categoryKeys,
    poolSize: pool.length,
    templates: pool.map((m) => ({
      templateId: m.template.id,
      airtableRecordId: m.airtableRecordId,
      name: m.template.name,
      rotationWeight: m.rotationWeight,
      categoryKeys: m.categoryKeys,
    })),
  });
});

/**
 * GET /api/templates/managed
 * List all templates from Airtable with full metadata.
 */
templatesRouter.get('/managed', (_req, res) => {
  const templates = listTemplatesWithMeta();
  res.json({
    count: templates.length,
    templates: templates.map((m) => ({
      templateId: m.template.id,
      airtableRecordId: m.airtableRecordId,
      name: m.template.name,
      outputFormat: m.template.outputFormat,
      imageCount: m.template.imageCount,
      rotationWeight: m.rotationWeight,
      categoryKeys: m.categoryKeys,
    })),
  });
});

/**
 * POST /api/templates/save-to-airtable
 * Save a template definition to Airtable.
 */
templatesRouter.post('/save-to-airtable', async (req, res) => {
  const { template, active, rotationWeight, recordId } = req.body as {
    template: TemplateDefinition;
    active?: boolean;
    rotationWeight?: number;
    recordId?: string;
  };

  if (!template || !template.id || !template.frames) {
    res.status(400).json({ error: 'Valid template with id and frames is required' });
    return;
  }

  try {
    const airtableRecordId = await saveTemplateToAirtable({
      reference: template.name || template.id,
      template_json: JSON.stringify(template),
      output_format: template.outputFormat,
      image_count: template.imageCount,
      template_active: active ?? false,
      rotation_weight: rotationWeight ?? 1,
      recordId,
    });

    // Also save to in-memory registry
    saveTemplate(template);

    // Refresh to pick up the new record
    const count = await refreshRegistry();

    res.json({ success: true, airtableRecordId, syncedTemplates: count });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errMsg });
  }
});

// ── Parameterized routes (after specific paths) ──

/**
 * GET /api/templates/:id
 * Get full template definition by ID.
 */
templatesRouter.get('/:id', (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
});

/**
 * POST /api/templates
 * Save a custom template to in-memory registry.
 */
templatesRouter.post('/', (req, res) => {
  const template = req.body as TemplateDefinition;
  if (!template.id || !template.name || !template.frames) {
    res.status(400).json({ error: 'Invalid template: id, name, and frames are required' });
    return;
  }
  saveTemplate(template);
  res.json({ success: true, id: template.id });
});

/**
 * PUT /api/templates/:recordId/activate
 * Toggle template_active on an Airtable template record.
 */
templatesRouter.put('/:recordId/activate', async (req, res) => {
  const { recordId } = req.params;
  const { active } = req.body as { active: boolean };

  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active (boolean) is required' });
    return;
  }

  try {
    await updateTemplateField(recordId, 'template_active', active);
    const count = await refreshRegistry();
    res.json({ success: true, active, syncedTemplates: count });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errMsg });
  }
});

/**
 * PUT /api/templates/:recordId/rotation
 * Update rotation_weight on an Airtable template record.
 */
templatesRouter.put('/:recordId/rotation', async (req, res) => {
  const { recordId } = req.params;
  const { weight } = req.body as { weight: number };

  if (typeof weight !== 'number' || weight < 0 || weight > 10) {
    res.status(400).json({ error: 'weight (number 0-10) is required' });
    return;
  }

  try {
    await updateTemplateField(recordId, 'rotation_weight', weight);
    const count = await refreshRegistry();
    res.json({ success: true, weight, syncedTemplates: count });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errMsg });
  }
});
