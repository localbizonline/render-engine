import { config } from '../config.js';
import type { PostBuilderRecord, PostType, RotationState } from '../types.js';

const BASE_URL = 'https://api.airtable.com/v0';

// ── Field IDs for post_builder table ──
const FIELDS = {
  content_title: 'fldCM6Dgef0PVViEs',
  content_subtitle: 'fld43kNgFk0rDbPwU',
  content_body: 'fldaz9Or0QhO2Gsls',
  primary_colour: 'fldQ0QepJsXzCTg65',
  secondary_colour: 'fldjeU7LROn8kWlpl',
  logo: 'fldj4dW0mmLhLdOwP',
  template_id: 'fldF0iPxTbl24X9eg',
  phone: 'fldpj5WlISZxfZJJg',         // phone_number_sent_to_leads (lookup)
  website: 'fldW1zFYr6mt0KAfT',        // partner_website (lookup)
  company_id: 'fldGX1aLOzAH3fGNP',     // linked record to companies
  before_photo_square: 'fldlX64WSAqeL2Byq',
  after_photo_square: 'fldr0yLmjdeW6BPax',
  // User image fields (square versions)
  user_image_1_square: 'fldJSRWbGz5PwZf32',
  user_image_2_square: 'fldluP6nSw6Hg7iz3',
  user_image_3_square: 'fldybV5vqWfRv5Nx7',
  user_image_4_square: 'fldvepVjelJ9LlRE2',
  user_image_5_square: 'fldFdVJ2bbA6B5fqx',
  user_image_6_square: 'fldk3xImYrQIDa5c4',
  user_image_7_square: 'fldM3A8INmTki7LQS',
  user_image_8_square: 'fldZKjO1TNXZ4gEiD',
  // CTA images (lookup from Companies)
  square_cta_image: 'fldPCfQruoz1iqJsY',
  landscape_cta_image: 'fldbxnebO2P16G1cV',
  // Post routing fields
  output_format: 'fld8QtscO9EE8gvAr',        // singleSelect: png | mp4
  post_type: 'fldLj8nHMHjNcmjKw',            // singleSelect: Post Type
  post_category_key: 'fldGjIElZrKI39Sei',     // lookup from post_category
  // Skip-render flags
  is_text_only: 'fldPwYQAitrZ3vOhL',         // checkbox
  upload_as_gallery: 'fldH4yF9XvmnUm0g3',     // checkbox
  is_user_uploaded_video: 'fldz58krzitDAFA5C', // checkbox
  // Output fields
  final_output: 'fld72zkew98o8jX3h',
  final_output_url: 'fldcAfXxlQsqq0h2s',
  render_status: 'fld5acoyY6iVET2Wz',
} as const;

async function airtableFetch(path: string, options: RequestInit = {}): Promise<any> {
  // Add returnFieldsByFieldId=true so we can use field IDs as keys
  const separator = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}/${config.airtable.baseId}/${path}${separator}returnFieldsByFieldId=true`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.airtable.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Airtable API error ${response.status}: ${body}`);
  }

  return response.json();
}

/**
 * Raw Airtable fetch without returnFieldsByFieldId (uses field names).
 */
async function airtableFetchByName(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${BASE_URL}/${config.airtable.baseId}/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.airtable.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Airtable API error ${response.status}: ${body}`);
  }

  return response.json();
}

/**
 * Extract first attachment URL from an Airtable attachment/lookup field.
 */
function getAttachmentUrl(field: any): string {
  if (!field) return '';
  // Lookup fields return array of attachment objects
  if (Array.isArray(field)) {
    const first = field[0];
    if (!first) return '';
    // If it's a nested array (lookup of attachment), unwrap
    if (Array.isArray(first)) return getAttachmentUrl(first);
    return first.url || first.thumbnails?.full?.url || '';
  }
  return '';
}

/**
 * Extract text from a field that might be a lookup array or plain string.
 */
function getText(field: any): string {
  if (!field) return '';
  if (Array.isArray(field)) return field[0] || '';
  return String(field);
}

interface CompanyData {
  company_name: string;
  service_areas: string;
  square_cta_image_url: string;
  landscape_cta_image_url: string;
}

/**
 * Fetch company data from the companies table — name, service_areas, CTA images.
 */
async function getCompanyData(companyRecordId: string): Promise<CompanyData> {
  const empty: CompanyData = {
    company_name: '',
    service_areas: '',
    square_cta_image_url: '',
    landscape_cta_image_url: '',
  };
  try {
    const data = await airtableFetchByName(`${config.airtable.companiesTableId}/${companyRecordId}`);
    const f = data.fields;
    return {
      company_name: f['Company name'] || '',
      service_areas: Array.isArray(f['partner_service_areas'])
        ? f['partner_service_areas'].join(', ')
        : (f['partner_service_areas'] || ''),
      square_cta_image_url: getAttachmentUrl(f['Square CTA Image']),
      landscape_cta_image_url: getAttachmentUrl(f['Landscape CTA Image']),
    };
  } catch (err) {
    console.warn(`[airtable] Failed to fetch company data for ${companyRecordId}:`, err);
    return empty;
  }
}

/**
 * Map the Airtable "Post Type" select value to our PostType union.
 */
function parsePostType(raw: string | undefined): PostType | undefined {
  if (!raw) return undefined;
  const map: Record<string, PostType> = {
    'Slideshow (3-8 image)': 'slideshow',
    'Gallery (3-8 image)': 'gallery',
    '1-2 Image Post': '1-2_image',
    'Before and After Post': 'before_after',
    'Text only': 'text_only',
    'User Reel Video': 'user_reel',
  };
  return map[raw] ?? undefined;
}

/**
 * Fetch a post_builder record by ID and map to our internal type.
 */
export async function getPostBuilderRecord(recordId: string): Promise<PostBuilderRecord> {
  const data = await airtableFetch(`${config.airtable.postBuilderTableId}/${recordId}`);
  const f = data.fields;

  // Collect user images from square fields (1-8)
  const userImages: string[] = [];
  const imageFieldIds = [
    FIELDS.user_image_1_square,
    FIELDS.user_image_2_square,
    FIELDS.user_image_3_square,
    FIELDS.user_image_4_square,
    FIELDS.user_image_5_square,
    FIELDS.user_image_6_square,
    FIELDS.user_image_7_square,
    FIELDS.user_image_8_square,
  ];

  for (const fieldId of imageFieldIds) {
    const url = getAttachmentUrl(f[fieldId]);
    if (url) userImages.push(url);
  }

  // Get template ID from linked record
  let templateId: string | null = null;
  const templateField = f[FIELDS.template_id];
  if (Array.isArray(templateField) && templateField.length > 0) {
    templateId = templateField[0]; // linked record returns array of record IDs
  }

  // Get company data (name, service_areas, CTA images) from linked company record
  let companyData: CompanyData = {
    company_name: '',
    service_areas: '',
    square_cta_image_url: '',
    landscape_cta_image_url: '',
  };
  const companyField = f[FIELDS.company_id];
  if (Array.isArray(companyField) && companyField.length > 0) {
    companyData = await getCompanyData(companyField[0]);
  }

  // CTA images: prefer lookup fields on post_builder, fall back to company data
  const squareCtaUrl = getAttachmentUrl(f[FIELDS.square_cta_image]) || companyData.square_cta_image_url;
  const landscapeCtaUrl = getAttachmentUrl(f[FIELDS.landscape_cta_image]) || companyData.landscape_cta_image_url;

  // Read output_format from the record's singleSelect field
  const rawOutputFormat = getText(f[FIELDS.output_format]);
  const outputFormat: 'png' | 'mp4' = rawOutputFormat === 'mp4' ? 'mp4' : 'png';

  // Read post_category_key (lookup → array of strings)
  const categoryKeyField = f[FIELDS.post_category_key];
  const postCategoryKey = getText(categoryKeyField);

  return {
    id: data.id,
    content_title: getText(f[FIELDS.content_title]) || 'Untitled',
    content_subtitle: getText(f[FIELDS.content_subtitle]) || '',
    content_body: getText(f[FIELDS.content_body]) || '',
    primary_colour: getText(f[FIELDS.primary_colour]) || '#235BAA',
    secondary_colour: getText(f[FIELDS.secondary_colour]) || '#4582D0',
    logo_url: getAttachmentUrl(f[FIELDS.logo]),
    user_images: userImages,
    phone: getText(f[FIELDS.phone]) || '',
    service_areas: companyData.service_areas,
    company_name: companyData.company_name,
    website: getText(f[FIELDS.website]) || '',
    template_id: templateId,
    output_format: outputFormat,
    before_photo_square_url: getAttachmentUrl(f[FIELDS.before_photo_square]),
    after_photo_square_url: getAttachmentUrl(f[FIELDS.after_photo_square]),
    // CTA images
    square_cta_image_url: squareCtaUrl,
    landscape_cta_image_url: landscapeCtaUrl,
    // Post routing
    post_type: parsePostType(getText(f[FIELDS.post_type])),
    post_category_key: postCategoryKey || undefined,
    // Skip-render flags (checkboxes → truthy/falsy)
    is_text_only: !!f[FIELDS.is_text_only],
    upload_as_gallery: !!f[FIELDS.upload_as_gallery],
    is_user_uploaded_video: !!f[FIELDS.is_user_uploaded_video],
    // Company link for rotation state
    company_id: Array.isArray(companyField) && companyField.length > 0 ? companyField[0] : undefined,
  };
}

// ── Test table: render_engine_test ──
const TEST_TABLE_ID = 'tblfeZjV98IuUZecl';
const TEMPLATES_TABLE_ID = 'tblHCrlFPZ5BWZfTo';

/**
 * Resolve builtin_id from a linked render_engine_templates record.
 */
async function resolveTemplateBuiltinId(templateRecordId: string): Promise<string | null> {
  try {
    const data = await airtableFetchByName(`${TEMPLATES_TABLE_ID}/${templateRecordId}`);
    return data.fields?.builtin_id || null;
  } catch (err) {
    console.warn(`[airtable] Failed to resolve template ${templateRecordId}:`, err);
    return null;
  }
}

/**
 * Fetch a record from the test table (uses field names, not IDs).
 */
export async function getTestRecord(recordId: string): Promise<PostBuilderRecord> {
  const data = await airtableFetchByName(`${TEST_TABLE_ID}/${recordId}`);
  const f = data.fields;

  const userImages: string[] = [];
  for (const key of ['user_image_1', 'user_image_2', 'user_image_3', 'user_image_4']) {
    const url = getAttachmentUrl(f[key]);
    if (url) userImages.push(url);
  }

  // Resolve template: prefer linked record → fall back to plain text field
  let templateId: string | null = null;
  const linkedTemplate = f.template;
  if (Array.isArray(linkedTemplate) && linkedTemplate.length > 0) {
    templateId = await resolveTemplateBuiltinId(linkedTemplate[0]);
    if (templateId) {
      console.log(`[airtable] Resolved linked template → builtin_id: ${templateId}`);
    }
  }
  // Fallback to old plain text template_id field
  if (!templateId && f.template_id) {
    templateId = f.template_id;
  }

  // CTA images: check dedicated fields first, fall back to logo field
  const squareCtaUrl = getAttachmentUrl(f.square_cta_image) || '';
  const landscapeCtaUrl = getAttachmentUrl(f.landscape_cta_image) || getAttachmentUrl(f.logo) || '';
  const logoUrl = getAttachmentUrl(f.logo) || '';

  return {
    id: data.id,
    content_title: f.content_title || 'Untitled',
    content_subtitle: f.content_subtitle || '',
    content_body: f.content_body || '',
    primary_colour: f.primary_colour || '#235BAA',
    secondary_colour: f.secondary_colour || '#4582D0',
    logo_url: logoUrl,
    user_images: userImages,
    phone: f.phone || '',
    service_areas: f.service_areas || '',
    company_name: f.company_name || '',
    website: f.website || '',
    template_id: templateId,
    output_format: 'png',
    before_photo_square_url: '',
    after_photo_square_url: '',
    square_cta_image_url: squareCtaUrl,
    landscape_cta_image_url: landscapeCtaUrl,
    is_text_only: false,
    upload_as_gallery: false,
    is_user_uploaded_video: false,
  };
}

/**
 * Update render result in the test table.
 * Resets generate_final_image checkbox so the user can re-check to re-render.
 */
export async function updateTestResult(
  recordId: string,
  result: { outputUrl: string; status: string },
): Promise<void> {
  await airtableFetchByName(`${TEST_TABLE_ID}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        render_status: result.status,
        final_output_url: result.outputUrl || '',
        generate_final_image: false,
        ...(result.outputUrl ? { final_output: [{ url: result.outputUrl }] } : {}),
      },
    }),
  });
}

/**
 * Update render result back to Airtable post_builder record.
 */
export async function updateRenderResult(
  recordId: string,
  result: {
    outputUrl: string;
    outputFormat: 'png' | 'mp4';
    status: 'completed' | 'failed';
    error?: string;
  },
): Promise<void> {
  const fields: Record<string, any> = {
    [FIELDS.render_status]: result.status === 'completed' ? 'completed' : `failed: ${result.error || 'unknown'}`,
    [FIELDS.final_output_url]: result.outputUrl || '',
  };

  // Set attachment field if we have a URL
  if (result.outputUrl) {
    fields[FIELDS.final_output] = [{ url: result.outputUrl }];
  }

  await airtableFetch(`${config.airtable.postBuilderTableId}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

// ── Template management ──

export interface AirtableTemplateRecord {
  id: string;
  reference: string;
  template_active: boolean;
  builtin_id: string;
  template_json: string;
  output_format: 'png' | 'mp4';
  image_count: number;
  category_keys: string[];
  rotation_weight: number;
}

/**
 * Fetch all template records from the Templates table.
 * Handles pagination via Airtable's offset mechanism.
 */
export async function fetchAllTemplates(): Promise<AirtableTemplateRecord[]> {
  const results: AirtableTemplateRecord[] = [];
  let offset: string | undefined;

  do {
    const params = offset ? `?offset=${offset}` : '';
    const data = await airtableFetchByName(`${config.airtable.templatesTableId}${params}`);

    for (const rec of data.records) {
      const f = rec.fields;
      results.push({
        id: rec.id,
        reference: f.Reference || '',
        template_active: !!f.template_active,
        builtin_id: f.builtin_id || '',
        template_json: f.template_json || '',
        output_format: f.output_format === 'mp4' ? 'mp4' : 'png',
        image_count: f.image_count || 0,
        category_keys: Array.isArray(f.category_key) ? f.category_key : [],
        rotation_weight: f.rotation_weight ?? 1,
      });
    }

    offset = data.offset;
  } while (offset);

  return results;
}

/**
 * Save a template definition to Airtable (create or update).
 */
export async function saveTemplateToAirtable(fields: {
  reference: string;
  template_json: string;
  output_format: 'png' | 'mp4';
  image_count: number;
  template_active?: boolean;
  rotation_weight?: number;
  recordId?: string;
}): Promise<string> {
  const airtableFields: Record<string, any> = {
    Reference: fields.reference,
    template_json: fields.template_json,
    output_format: fields.output_format,
    image_count: fields.image_count,
  };

  if (fields.template_active !== undefined) {
    airtableFields.template_active = fields.template_active;
  }
  if (fields.rotation_weight !== undefined) {
    airtableFields.rotation_weight = fields.rotation_weight;
  }

  if (fields.recordId) {
    // Update existing
    await airtableFetchByName(`${config.airtable.templatesTableId}/${fields.recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: airtableFields }),
    });
    return fields.recordId;
  }

  // Create new
  const data = await airtableFetchByName(config.airtable.templatesTableId, {
    method: 'POST',
    body: JSON.stringify({ fields: airtableFields }),
  });
  return data.id;
}

/**
 * Update a single field on a template record (e.g. template_active toggle).
 */
export async function updateTemplateField(
  recordId: string,
  fieldName: string,
  value: any,
): Promise<void> {
  await airtableFetchByName(`${config.airtable.templatesTableId}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { [fieldName]: value } }),
  });
}

// ── Company rotation state ──

const DEFAULT_ROTATION_STATE: RotationState = {
  png: { lastIndex: 0 },
  mp4: { lastIndex: 0 },
};

/**
 * Get rotation state for a company. Returns default if not set.
 */
export async function getCompanyRotationState(companyRecordId: string): Promise<RotationState> {
  try {
    const data = await airtableFetchByName(`${config.airtable.companiesTableId}/${companyRecordId}`);
    const raw = data.fields?.template_rotation_state;
    if (!raw) return { ...DEFAULT_ROTATION_STATE };
    return JSON.parse(raw) as RotationState;
  } catch {
    return { ...DEFAULT_ROTATION_STATE };
  }
}

/**
 * Write updated rotation state back to the company record.
 */
export async function updateCompanyRotationState(
  companyRecordId: string,
  state: RotationState,
): Promise<void> {
  await airtableFetchByName(`${config.airtable.companiesTableId}/${companyRecordId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: { template_rotation_state: JSON.stringify(state) },
    }),
  });
}
