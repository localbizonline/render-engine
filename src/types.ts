// ── Template Definition ──

export interface TemplateDefinition {
  id: string;
  name: string;
  reference: string;
  outputFormat: 'png' | 'mp4';
  width: number;
  height: number;
  imageCount: number;
  categoryKeys: string[];
  fps?: number;
  duration?: number;
  frames: FrameDefinition[];
  transition?: {
    type: 'fade' | 'slide_left' | 'slide_right' | 'zoom' | 'crossfade';
    durationMs: number;
  };
}

export interface FrameDefinition {
  durationMs?: number;
  background: BackgroundDef;
  layers: LayerDefinition[];
}

export type BackgroundDef =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; colors: string[]; angle: number }
  | { type: 'image'; source: 'user_image'; index: number };

export type LayerDefinition =
  | ImageLayer
  | TextLayer
  | RectLayer
  | LogoLayer
  | AccentBarLayer
  | CtaImageLayer;

export interface BaseLayer {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: 'top-left' | 'center' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  borderRadius?: number;
  visible?: boolean;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  source: 'user_image';
  index: number;
  fit: 'cover' | 'contain' | 'fill';
  shadow?: { blur: number; offsetX: number; offsetY: number; color: string };
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'regular' | 'medium' | 'semibold' | 'bold';
  color: string;
  align: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  maxLines?: number;
  lineHeight?: number;
  textTransform?: 'uppercase' | 'lowercase' | 'none';
  padding?: number;
  letterSpacing?: number;
}

export interface RectLayer extends BaseLayer {
  type: 'rect';
  fill: string;
  stroke?: { color: string; width: number };
}

export interface LogoLayer extends BaseLayer {
  type: 'logo';
  fit: 'contain' | 'cover';
  padding?: number;
  background?: string;
}

export interface AccentBarLayer extends BaseLayer {
  type: 'accent_bar';
  color: string;
}

export interface CtaImageLayer extends BaseLayer {
  type: 'cta_image';
  variant: 'square' | 'landscape';
  fit: 'contain' | 'cover';
  padding?: number;
  background?: string;
}

// ── Render Variables (resolved from Airtable at render time) ──

export interface RenderVariables {
  title: string;
  subtitle: string;
  body: string;
  phone: string;
  service_areas: string;
  primary_colour: string;
  secondary_colour: string;
  logo_url: string;
  user_images: string[];
  company_name: string;
  website?: string;
  square_cta_image_url?: string;
  landscape_cta_image_url?: string;
}

// ── API Types ──

export interface RenderRequest {
  recordId: string;
  templateId?: string;
  preview?: boolean;
}

export interface RenderResponse {
  success: boolean;
  outputUrl?: string;
  outputFormat?: 'png' | 'mp4';
  templateUsed?: string;
  renderTimeMs?: number;
  error?: string;
}

export interface DesignRequest {
  prompt: string;
  existingTemplate?: TemplateDefinition;
  width?: number;
  height?: number;
}

export interface DesignResponse {
  template: TemplateDefinition;
  previewBase64?: string;
}

// ── Airtable Record Types ──

export type PostType =
  | 'slideshow'     // Slideshow (3-8 image)
  | 'gallery'       // Gallery (3-8 image) — upload_as_gallery
  | '1-2_image'     // 1-2 Image Post
  | 'before_after'  // Before and After Post
  | 'text_only'     // Text only
  | 'user_reel';    // User Reel Video

export interface PostBuilderRecord {
  id: string;
  content_title: string;
  content_subtitle: string;
  content_body: string;
  primary_colour: string;
  secondary_colour: string;
  logo_url: string;
  user_images: string[];
  phone: string;
  service_areas: string;
  company_name: string;
  website: string;
  template_id: string | null;
  output_format: 'png' | 'mp4';
  before_photo_square_url?: string;
  after_photo_square_url?: string;
  // CTA images from Companies table
  square_cta_image_url?: string;
  landscape_cta_image_url?: string;
  // Post routing fields
  post_type?: PostType;
  post_category_key?: string;
  // Skip-render flags
  is_text_only: boolean;
  upload_as_gallery: boolean;
  is_user_uploaded_video: boolean;
  // Company link (for rotation state)
  company_id?: string;
}

export interface TemplateRecord {
  id: string;
  name: string;
  reference: string;
  creatomate_template_id: string;
  output_format: 'png' | 'mp4';
  image_count: number;
  category_keys: string[];
  builtin_id?: string;
  template_json?: string;
  rotation_weight: number;
  template_active: boolean;
}

export interface RotationState {
  png: { lastIndex: number };
  mp4: { lastIndex: number };
}

export interface TemplateWithMeta {
  template: TemplateDefinition;
  airtableRecordId: string;
  rotationWeight: number;
  categoryKeys: string[];
}
