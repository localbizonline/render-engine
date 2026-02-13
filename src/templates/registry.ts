import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { TemplateDefinition, PostType, RotationState, TemplateWithMeta } from '../types.js';
import { templateSchema } from './schema.js';
import {
  fetchAllTemplates,
  getCompanyRotationState,
  updateCompanyRotationState,
} from '../services/airtable.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtinDir = path.resolve(__dirname, 'builtin');

// ── In-memory stores ──

// Built-in templates loaded from JSON files (keyed by builtin ID)
const builtinTemplates = new Map<string, TemplateDefinition>();

// All active templates with metadata (keyed by Airtable record ID)
const templatesByAirtableId = new Map<string, TemplateWithMeta>();

// Lookup from builtin ID → Airtable record ID (for backward compat)
const builtinIdToAirtableId = new Map<string, string>();

// All active templates also keyed by their template.id (builtin ID or custom ID)
const templatesByTemplateId = new Map<string, TemplateWithMeta>();

let refreshTimer: ReturnType<typeof setInterval> | null = null;

// ── Built-in template loading ──

function loadBuiltinTemplates() {
  const files = [
    'main-2-image.json',
    'before-after.json',
    'main-1-image.json',
    'slideshow-base.json',
    'bold-diagonal.json',
    'card-stack.json',
    'hero-banner.json',
    'minimal-split.json',
    'gradient-overlay.json',
  ];

  for (const file of files) {
    const filePath = path.join(builtinDir, file);
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as TemplateDefinition;
    builtinTemplates.set(data.id, data);
  }

  console.log(`[registry] Loaded ${builtinTemplates.size} built-in templates from disk`);
}

// ── Airtable sync ──

/**
 * Sync templates from Airtable. For each active record:
 * - If builtin_id matches a loaded built-in → use that JSON
 * - If template_json is set → parse and validate
 * - Otherwise skip (legacy Creatomate-only record)
 */
export async function syncFromAirtable(): Promise<number> {
  try {
    const records = await fetchAllTemplates();

    // Clear synced maps but keep builtinTemplates intact
    templatesByAirtableId.clear();
    builtinIdToAirtableId.clear();
    templatesByTemplateId.clear();

    let synced = 0;

    for (const rec of records) {
      if (!rec.template_active) continue;

      let template: TemplateDefinition | null = null;

      // Priority 1: builtin_id references a file-based template
      if (rec.builtin_id && builtinTemplates.has(rec.builtin_id)) {
        template = builtinTemplates.get(rec.builtin_id)!;
        builtinIdToAirtableId.set(rec.builtin_id, rec.id);
      }
      // Priority 2: template_json contains inline definition
      else if (rec.template_json) {
        try {
          const parsed = JSON.parse(rec.template_json);
          const validated = templateSchema.parse(parsed);
          template = validated as TemplateDefinition;
        } catch (err) {
          console.warn(`[registry] Invalid template_json on ${rec.id} (${rec.reference}):`, err);
          continue;
        }
      }
      // Skip — no usable template definition
      else {
        continue;
      }

      const meta: TemplateWithMeta = {
        template,
        airtableRecordId: rec.id,
        rotationWeight: Math.max(0, rec.rotation_weight ?? 1),
        categoryKeys: rec.category_keys,
      };

      templatesByAirtableId.set(rec.id, meta);
      templatesByTemplateId.set(template.id, meta);
      synced++;
    }

    console.log(`[registry] Synced ${synced} active templates from Airtable (${records.length} total records)`);
    return synced;
  } catch (err) {
    console.error('[registry] Failed to sync from Airtable:', err);
    // If sync fails, ensure built-in templates are still accessible
    ensureBuiltinsFallback();
    return 0;
  }
}

/**
 * If Airtable sync fails completely, make sure built-in templates are
 * still available via the templatesByTemplateId map.
 */
function ensureBuiltinsFallback() {
  if (templatesByTemplateId.size > 0) return; // Already have some templates
  for (const [id, template] of builtinTemplates) {
    templatesByTemplateId.set(id, {
      template,
      airtableRecordId: '',
      rotationWeight: 1,
      categoryKeys: template.categoryKeys,
    });
  }
  console.log(`[registry] Fallback: loaded ${builtinTemplates.size} built-in templates into registry`);
}

// ── Public API ──

/**
 * Initialize the registry: load built-ins from disk, then sync from Airtable.
 */
export async function initRegistry(): Promise<void> {
  loadBuiltinTemplates();

  await syncFromAirtable();

  // If no templates were synced (Airtable down or empty), use built-in fallback
  if (templatesByTemplateId.size === 0) {
    ensureBuiltinsFallback();
  }

  // Periodic refresh every 5 minutes
  if (!refreshTimer) {
    refreshTimer = setInterval(() => {
      syncFromAirtable().catch((err) =>
        console.error('[registry] Periodic refresh failed:', err),
      );
    }, 5 * 60 * 1000);
  }
}

/**
 * Force a re-sync from Airtable. Returns count of synced templates.
 */
export async function refreshRegistry(): Promise<number> {
  return syncFromAirtable();
}

/**
 * Get template by its builtin/custom ID (e.g. "main-2-image").
 */
export function getTemplate(id: string): TemplateDefinition | undefined {
  const meta = templatesByTemplateId.get(id);
  if (meta) return meta.template;
  // Fallback: check raw built-ins (for test-render.ts which may run before sync)
  return builtinTemplates.get(id);
}

/**
 * Get template by Airtable record ID from the Templates table.
 */
export function getTemplateByAirtableId(airtableRecordId: string): TemplateDefinition | undefined {
  return templatesByAirtableId.get(airtableRecordId)?.template;
}

/**
 * Save a custom template to the in-memory registry.
 */
export function saveTemplate(template: TemplateDefinition) {
  const meta: TemplateWithMeta = {
    template,
    airtableRecordId: '',
    rotationWeight: 1,
    categoryKeys: template.categoryKeys,
  };
  templatesByTemplateId.set(template.id, meta);
}

/**
 * List all active templates (metadata only for API responses).
 */
export function listTemplates(): TemplateDefinition[] {
  return Array.from(templatesByTemplateId.values()).map((m) => m.template);
}

/**
 * List all templates with full metadata (for management endpoints).
 */
export function listTemplatesWithMeta(): TemplateWithMeta[] {
  return Array.from(templatesByAirtableId.values());
}

// ── Rotation Pool ──

/**
 * Build a rotation pool of templates matching the given criteria.
 * Templates with weight > 1 appear multiple times.
 * Sorted deterministically by Airtable record ID.
 */
export function getRotationPool(
  format: 'png' | 'mp4',
  imageCount: number,
  categoryKeys?: string[],
): TemplateWithMeta[] {
  const candidates: TemplateWithMeta[] = [];

  for (const meta of templatesByAirtableId.values()) {
    const t = meta.template;

    // Must match output format
    if (t.outputFormat !== format) continue;

    // Must be able to handle the image count
    if (t.imageCount > imageCount) continue;

    // If category filter provided, at least one must match
    if (categoryKeys && categoryKeys.length > 0) {
      const hasMatch = meta.categoryKeys.some((k) => categoryKeys.includes(k));
      if (!hasMatch) continue;
    }

    // Skip templates with weight 0 (excluded from rotation)
    if (meta.rotationWeight <= 0) continue;

    candidates.push(meta);
  }

  // Sort by Airtable record ID for deterministic ordering
  candidates.sort((a, b) => a.airtableRecordId.localeCompare(b.airtableRecordId));

  // Expand by weight (weight 3 → 3 entries)
  const pool: TemplateWithMeta[] = [];
  for (const c of candidates) {
    const count = Math.min(Math.max(1, Math.round(c.rotationWeight)), 10);
    for (let i = 0; i < count; i++) {
      pool.push(c);
    }
  }

  return pool;
}

/**
 * Select the next template from a rotation pool using round-robin.
 * Returns the selected template and the updated rotation state.
 */
export function selectFromPool(
  pool: TemplateWithMeta[],
  state: RotationState,
  format: 'png' | 'mp4',
): { selected: TemplateWithMeta; updatedState: RotationState } | null {
  if (pool.length === 0) return null;

  const formatState = format === 'png' ? state.png : state.mp4;
  const nextIndex = (formatState.lastIndex + 1) % pool.length;

  const updatedState: RotationState = {
    ...state,
    [format]: { lastIndex: nextIndex },
  };

  return { selected: pool[nextIndex], updatedState };
}

// ── Auto-selection (main entry point) ──

/**
 * Auto-select a template for a render job. Uses rotation when company_id
 * is available, falls back to hash-based selection.
 */
export async function autoSelectTemplate(
  imageCount: number,
  recordId: string,
  categoryKeys?: string[],
  preferMp4?: boolean,
  postType?: PostType,
  companyId?: string,
): Promise<TemplateDefinition | undefined> {
  // 1. Before & After — explicit post type or category key
  if (postType === 'before_after' || categoryKeys?.includes('before_after')) {
    return getTemplate('before-after');
  }

  // 2. Slideshow — explicit post type or mp4 preference with enough images
  if (postType === 'slideshow' || (preferMp4 && imageCount >= 3)) {
    return getTemplate('slideshow-base');
  }

  const format: 'png' | 'mp4' = preferMp4 && imageCount >= 3 ? 'mp4' : 'png';

  // 3. Try rotation pool (requires company_id)
  if (companyId) {
    const pool = getRotationPool(format, imageCount, categoryKeys);
    if (pool.length > 0) {
      try {
        const state = await getCompanyRotationState(companyId);
        const result = selectFromPool(pool, state, format);
        if (result) {
          await updateCompanyRotationState(companyId, result.updatedState).catch((err) =>
            console.warn('[registry] Failed to update rotation state:', err),
          );
          console.log(`[registry] Rotation selected: ${result.selected.template.id} for company ${companyId}`);
          return result.selected.template;
        }
      } catch (err) {
        console.warn('[registry] Rotation failed, falling back to hash:', err);
      }
    }
  }

  // 4. Fallback: hash-based selection (no company_id or rotation failed)
  return hashBasedSelect(imageCount, recordId);
}

/**
 * Original hash-based selection logic as fallback.
 */
function hashBasedSelect(imageCount: number, recordId: string): TemplateDefinition | undefined {
  const hash = simpleHash(recordId);

  if (imageCount <= 1) {
    return getTemplate('main-1-image');
  }

  if (imageCount === 2) {
    const options = ['main-2-image', 'before-after'];
    return getTemplate(options[hash % options.length]);
  }

  const options = ['main-1-image', 'main-2-image', 'before-after'];
  return getTemplate(options[hash % options.length]);
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
