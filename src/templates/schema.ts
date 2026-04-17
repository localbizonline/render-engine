import { z } from 'zod';

const backgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: z.string() }),
  z.object({ type: z.literal('gradient'), colors: z.array(z.string()), angle: z.number() }),
  z.object({ type: z.literal('image'), source: z.literal('user_image'), index: z.number() }),
]);

const baseLayerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  anchor: z.enum(['top-left', 'center', 'bottom-left', 'bottom-right']).optional(),
  opacity: z.number().optional(),
  borderRadius: z.number().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
});

const imageLayerSchema = baseLayerSchema.extend({
  type: z.literal('image'),
  source: z.literal('user_image'),
  index: z.number(),
  fit: z.enum(['cover', 'contain', 'fill']),
  shadow: z.object({
    blur: z.number(),
    offsetX: z.number(),
    offsetY: z.number(),
    color: z.string(),
  }).optional(),
});

const textLayerSchema = baseLayerSchema.extend({
  type: z.literal('text'),
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.enum(['regular', 'medium', 'semibold', 'bold']),
  color: z.string(),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  maxLines: z.number().optional(),
  lineHeight: z.number().optional(),
  textTransform: z.enum(['uppercase', 'lowercase', 'none']).optional(),
  padding: z.number().optional(),
  letterSpacing: z.number().optional(),
});

const rectLayerSchema = baseLayerSchema.extend({
  type: z.literal('rect'),
  fill: z.string(),
  stroke: z.object({
    color: z.string(),
    width: z.number(),
  }).optional(),
});

const logoLayerSchema = baseLayerSchema.extend({
  type: z.literal('logo'),
  fit: z.enum(['contain', 'cover']),
  padding: z.number().optional(),
  background: z.string().optional(),
});

const accentBarLayerSchema = baseLayerSchema.extend({
  type: z.literal('accent_bar'),
  color: z.string(),
});

const ctaImageLayerSchema = baseLayerSchema.extend({
  type: z.literal('cta_image'),
  variant: z.enum(['square', 'landscape']),
  fit: z.enum(['contain', 'cover']),
  padding: z.number().optional(),
  background: z.string().optional(),
});

const assetImageLayerSchema = baseLayerSchema.extend({
  type: z.literal('asset_image'),
  assetId: z.string().optional(),
  assetUrl: z.string(),
  fit: z.enum(['cover', 'contain', 'fill']),
  background: z.string().optional(),
  padding: z.number().optional(),
  shadow: z.object({
    blur: z.number(),
    offsetX: z.number(),
    offsetY: z.number(),
    color: z.string(),
  }).optional(),
});

const layerSchema = z.discriminatedUnion('type', [
  imageLayerSchema,
  textLayerSchema,
  rectLayerSchema,
  logoLayerSchema,
  accentBarLayerSchema,
  ctaImageLayerSchema,
  assetImageLayerSchema,
]);

const frameSchema = z.object({
  // Added 2026-04-17: a frame tagged kind:'photoSlot' is expanded at
  // render time into N copies of the template's `photoFrame`, one per
  // uploaded user image. A photoSlot frame is a pure marker — its
  // background/layers are ignored. See
  // social-posting-v2/docs/PLAN_2026-04-17_SOUNDTRACKS_AND_DYNAMIC_TEMPLATES.md.
  kind: z.enum(['photoSlot']).optional(),
  durationMs: z.number().optional(),
  background: backgroundSchema,
  layers: z.array(layerSchema),
});

export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  reference: z.string(),
  outputFormat: z.enum(['mp4']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  imageCount: z.number().int().min(0),
  categoryKeys: z.array(z.string()),
  fps: z.number().optional(),
  duration: z.number().optional(),
  frames: z.array(frameSchema).min(1),
  // Repeated once per uploaded photo at render time, replacing any
  // frame whose kind is 'photoSlot'. When absent, frames array is
  // rendered as-is (legacy static-count behaviour).
  photoFrame: frameSchema.optional(),
  transition: z.object({
    type: z.enum(['fade', 'slide_left', 'slide_right', 'zoom', 'crossfade']),
    durationMs: z.number(),
  }).optional(),
});

export type ValidatedTemplate = z.infer<typeof templateSchema>;
