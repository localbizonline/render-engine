import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TemplateDefinition } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtinDir = path.resolve(__dirname, 'builtin');

// Map Airtable template record IDs → built-in template IDs
const AIRTABLE_TO_BUILTIN: Record<string, string> = {
  // Main 2 image (PNG)
  'rec1S46CH1YGXZTK7': 'main-2-image',
  // Before & After (PNG)
  'rec4bqtFERB8S1u7u': 'before-after',
  // Before & After Ashley variant (same layout for now)
  'recEI3fjr6S9itCwZ': 'before-after',
  // Main 1 image
  'recu9Fo6bSoJADZoa': 'main-1-image',
};

// In-memory template store
const templates = new Map<string, TemplateDefinition>();

function loadBuiltinTemplates() {
  const files = ['main-2-image.json', 'before-after.json', 'main-1-image.json', 'slideshow-base.json'];

  for (const file of files) {
    const filePath = path.join(builtinDir, file);
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as TemplateDefinition;
    templates.set(data.id, data);
  }

  console.log(`[registry] Loaded ${templates.size} built-in templates`);
}

export function initRegistry() {
  loadBuiltinTemplates();
}

/**
 * Get template by its built-in ID (e.g. "main-2-image")
 */
export function getTemplate(id: string): TemplateDefinition | undefined {
  return templates.get(id);
}

/**
 * Get template by Airtable record ID from the templates table
 */
export function getTemplateByAirtableId(airtableRecordId: string): TemplateDefinition | undefined {
  const builtinId = AIRTABLE_TO_BUILTIN[airtableRecordId];
  if (!builtinId) return undefined;
  return templates.get(builtinId);
}

/**
 * Save a custom template (from the design flow)
 */
export function saveTemplate(template: TemplateDefinition) {
  templates.set(template.id, template);
}

/**
 * List all templates
 */
export function listTemplates(): TemplateDefinition[] {
  return Array.from(templates.values());
}
