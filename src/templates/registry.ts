import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TemplateDefinition } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtinDir = path.resolve(__dirname, 'builtin');

const builtinTemplates = new Map<string, TemplateDefinition>();
const customTemplates = new Map<string, TemplateDefinition>();

function loadBuiltinTemplates() {
  if (builtinTemplates.size > 0) return;

  const files = [
    'slideshow-base.json',
    'vertical-reel-base.json',
  ];

  for (const file of files) {
    const filePath = path.join(builtinDir, file);
    const template = JSON.parse(readFileSync(filePath, 'utf-8')) as TemplateDefinition;
    builtinTemplates.set(template.id, template);
  }

  console.log(`[registry] Loaded ${builtinTemplates.size} built-in templates from disk`);
}

function getCombinedTemplates(): TemplateDefinition[] {
  const combined = new Map(builtinTemplates);
  for (const [id, template] of customTemplates) {
    combined.set(id, template);
  }
  return Array.from(combined.values());
}

export async function initRegistry(): Promise<void> {
  loadBuiltinTemplates();
}

export function getTemplate(id: string): TemplateDefinition | undefined {
  loadBuiltinTemplates();
  return customTemplates.get(id) || builtinTemplates.get(id);
}

export function saveTemplate(template: TemplateDefinition) {
  customTemplates.set(template.id, template);
}

export function listTemplates(): TemplateDefinition[] {
  loadBuiltinTemplates();
  return getCombinedTemplates();
}

export async function autoSelectTemplate(
  imageCount: number,
  recordId: string,
  categoryKeys?: string[],
  preferMp4?: boolean,
  postType?: string,
): Promise<TemplateDefinition | undefined> {
  if (postType === 'before_after' || categoryKeys?.includes('before_after')) {
    return getTemplate('slideshow-base');
  }

  if (postType === 'slideshow' || preferMp4 || imageCount >= 3) {
    return getTemplate('vertical-reel-base');
  }

  const hash = simpleHash(recordId);
  const options = ['vertical-reel-base', 'slideshow-base'];
  return getTemplate(options[hash % options.length]);
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return Math.abs(hash);
}
