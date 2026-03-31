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

// ── Render Variables ──

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

// ── Vision Design Types ──

export interface VisionDesignRequest {
  referenceImage: string;   // data:image/...;base64,... URI
  prompt?: string;
  width?: number;
  height?: number;
}

export interface VisionIterateRequest {
  referenceImage: string;
  previewImage: string;
  feedback: string;
  existingTemplate: TemplateDefinition;
}

export interface VisionCompareRequest {
  referenceImage: string;
  previewImage: string;
  currentTemplate: TemplateDefinition;
}

export interface VisionCompareResponse {
  score: number;
  feedback: string;
  shouldContinue: boolean;
}

// ── Combined Compare + Iterate (auto-iterate loop) ──

export interface IterationHistoryEntry {
  iteration: number;
  score: number;
  feedback: string;
  changesApplied: string;
}

export interface CompareAndIterateRequest {
  referenceImage: string;
  previewImage: string;
  existingTemplate: TemplateDefinition;
  iterationHistory: IterationHistoryEntry[];
  iterationNumber: number;
  maxIterations: number;
  plateauWarning?: boolean;
}

export interface CompareAndIterateResponse {
  score: number;
  feedback: string;
  shouldContinue: boolean;
  template?: TemplateDefinition;
  previewBase64?: string;
  changesApplied: string;
}
