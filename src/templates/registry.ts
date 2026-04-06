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
    'main-2-image.json',
    'before-after.json',
    'main-1-image.json',
    'slideshow-base.json',
    'vertical-reel-base.json',
    'bold-diagonal.json',
    'card-stack.json',
    'hero-banner.json',
    'minimal-split.json',
    'gradient-overlay.json',
    'left-panel-before-after.json',
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
    return getTemplate('before-after');
  }

  if (postType === 'slideshow' || (preferMp4 && imageCount >= 3)) {
    return getTemplate('vertical-reel-base');
  }

  const hash = simpleHash(recordId);

  if (imageCount <= 1) {
    return getTemplate('main-1-image');
  }

  if (imageCount === 2) {
    const options = ['main-2-image', 'before-after', 'left-panel-before-after'];
    return getTemplate(options[hash % options.length]);
  }

  const options = ['vertical-reel-base', 'main-1-image', 'main-2-image'];
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
