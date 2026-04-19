// ── Template Definition ──

export interface TemplateDefinition {
  id: string;
  name: string;
  reference: string;
  outputFormat: 'mp4';
  width: number;
  height: number;
  imageCount: number;
  categoryKeys: string[];
  fps?: number;
  duration?: number;
  frames: FrameDefinition[];
  /**
   * Repeated once per uploaded user photo at render time. Replaces any
   * frame in `frames` whose `kind === 'photoSlot'`. Absent = legacy
   * static-count behaviour (frames rendered as-is).
   * See social-posting-v2/docs/PLAN_2026-04-17_SOUNDTRACKS_AND_DYNAMIC_TEMPLATES.md.
   */
  photoFrame?: FrameDefinition;
  transition?: {
    type: 'fade' | 'slide_left' | 'slide_right' | 'zoom' | 'crossfade';
    durationMs: number;
  };
}

export interface FrameDefinition {
  /**
   * Tagged 'photoSlot' to mark the insertion point for photoFrame
   * expansion in dynamic-count templates. The frame's own background
   * and layers are ignored when kind === 'photoSlot'.
   */
  kind?: 'photoSlot';
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
  | CtaImageLayer
  | AssetImageLayer;

export interface BaseLayer {
  id?: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: 'top-left' | 'center' | 'bottom-left' | 'bottom-right';
  opacity?: number;
  borderRadius?: number;
  visible?: boolean;
  locked?: boolean;
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

export interface AssetImageLayer extends BaseLayer {
  type: 'asset_image';
  assetId?: string;
  assetUrl: string;
  fit: 'cover' | 'contain' | 'fill';
  background?: string;
  padding?: number;
  shadow?: { blur: number; offsetX: number; offsetY: number; color: string };
}

// ── Render Variables ──

export interface RenderVariables {
  title: string;
  post_title?: string;
  subtitle: string;
  body: string;
  post_body?: string;
  phone: string;
  phone_display?: string;
  service_areas: string;
  business_name?: string;
  primary_colour: string;
  secondary_colour: string;
  logo_url: string;
  square_logo_url?: string;
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
  outputFormat?: 'mp4';
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
  previewPosterBase64?: string;
  previewKind?: 'image' | 'video';
  previewUrl?: string;
  previewWarning?: string;
  frameIndex?: number;
}

export interface ReferenceVideoSceneAnalysis {
  order: number;
  role: 'hook' | 'problem' | 'proof' | 'detail' | 'offer' | 'cta' | 'brand';
  visualStyle: 'full_bleed_image' | 'split_image' | 'text_panel' | 'logo_end_card';
  overlayPlacement: 'top' | 'center' | 'bottom' | 'full';
  textAmount: 'none' | 'light' | 'medium' | 'heavy';
  focus: string;
}

export interface ReferenceVideoAnalysis {
  orientation: 'portrait' | 'landscape' | 'square';
  aspectRatio: string;
  durationBucket: 'very_short' | 'short' | 'medium' | 'long';
  pacing: 'slow' | 'steady' | 'fast' | 'punchy';
  majorSceneCount: number;
  headlineTextDensity: 'none' | 'light' | 'medium' | 'heavy';
  overlayTreatment: 'minimal' | 'dark_panel' | 'light_panel' | 'gradient_scrim' | 'brand_blocks';
  ctaTreatment: 'none' | 'phone_banner' | 'button_end_card' | 'logo_end_card' | 'text_only';
  colorDirection: {
    mood: string;
    dominantHex: string;
    secondaryHex: string;
    accentHex: string;
    contrast: 'low' | 'medium' | 'high';
  };
  slideshowBlueprint: {
    recommendedFrameCount: number;
    transition: 'fade' | 'slide_left' | 'slide_right' | 'zoom' | 'crossfade';
    openingStyle: string;
    closingStyle: string;
  };
  scenes: ReferenceVideoSceneAnalysis[];
  confidence: number;
  notes?: string[];
}

export interface VideoDesignResponse extends DesignResponse {
  analysis: ReferenceVideoAnalysis;
}

export interface VideoCompareIterateRequest {
  existingTemplate: TemplateDefinition;
  previewVideoUrl?: string;
  previewImage?: string;
  prompt?: string;
  feedback?: string;
  iterationHistory?: IterationHistoryEntry[];
  iterationNumber?: number;
  maxIterations?: number;
  currentAnalysis?: ReferenceVideoAnalysis;
}

export interface VideoCompareIterateResponse extends CompareAndIterateResponse {
  analysis?: ReferenceVideoAnalysis;
}

// ── Review / Iteration Types ──

export interface IterationHistoryEntry {
  iteration: number;
  score: number;
  feedback: string;
  changesApplied: string;
}

export interface CompareAndIterateResponse {
  score: number;
  feedback: string;
  shouldContinue: boolean;
  template?: TemplateDefinition;
  previewBase64?: string;
  previewPosterBase64?: string;
  previewKind?: 'image' | 'video';
  previewUrl?: string;
  previewWarning?: string;
  frameIndex?: number;
  changesApplied: string;
}

export interface DesignerChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface DesignerChatDraftContext {
  prompt?: string;
  referenceInputMode?: 'video' | 'prompt' | 'blank' | 'v2';
  referenceVideoActive?: boolean;
  currentTemplate?: TemplateDefinition | null;
  currentPreview?: string | null;
  currentPreviewKind?: 'image' | 'video';
  currentPreviewVideoUrl?: string;
  currentVideoAnalysis?: ReferenceVideoAnalysis | null;
  previewFrameIndex?: number;
  handoff?: {
    exportUrl?: string;
    saveName?: string;
    saveId?: string;
    saveImageCount?: string;
  };
}

export interface DesignerChatTurnRequest {
  sessionId?: string;
  message: string;
  draftContext?: DesignerChatDraftContext;
}

export interface DesignerChatTurnResponse {
  sessionId: string;
  messages: DesignerChatMessage[];
  assistantMessage: DesignerChatMessage;
  action: 'generated' | 'iterated' | 'info';
  template?: TemplateDefinition;
  previewBase64?: string;
  previewPosterBase64?: string;
  previewKind?: 'image' | 'video';
  previewUrl?: string;
  previewWarning?: string;
  frameIndex?: number;
}
