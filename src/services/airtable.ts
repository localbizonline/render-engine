import { config } from '../config.js';
import type { PostBuilderRecord } from '../types.js';

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
  phone: 'fldpj5WlISZxfZJJg',
  website: 'fldW1zFYr6mt0KAfT',
  before_photo_square: 'fldlX64WSAqeL2Byq',
  after_photo_square: 'fldr0yLmjdeW6BPax',
  // User image fields (square versions)
  user_image_1_square: 'fldJSRWbGz5PwZf32',
  user_image_2_square: 'fldwJsQe9rqMy2EuT',
  user_image_3_square: 'fldYsm6ZH7H7UxXrL',
  user_image_4_square: 'fldYCQFSoYJPq7AQT',
  user_image_5_square: 'fldlO8SWXI3NYtb8l',
  user_image_6_square: 'fldjQDKjVSAlGBWTN',
  user_image_7_square: 'fldJaqluaPhRfLPLc',
  user_image_8_square: 'fldZKjO1TNXZ4gEiD',
  // Output fields
  final_output: 'fld72zkew98o8jX3h',
  final_output_url: 'fldcAfXxlQsqq0h2s',
  render_status: 'fld5acoyY6iVET2Wz',
  // Company fields (lookups)
  service_areas: 'fldoYoWm15zz5Q1a2',
  company_name: 'fldXNlrQYUQS9DhJm',
} as const;

async function airtableFetch(path: string, options: RequestInit = {}): Promise<any> {
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
    service_areas: getText(f[FIELDS.service_areas]) || '',
    company_name: getText(f[FIELDS.company_name]) || '',
    website: getText(f[FIELDS.website]) || '',
    template_id: templateId,
    output_format: 'png', // default, can be overridden by template
    before_photo_square_url: getAttachmentUrl(f[FIELDS.before_photo_square]),
    after_photo_square_url: getAttachmentUrl(f[FIELDS.after_photo_square]),
  };
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
