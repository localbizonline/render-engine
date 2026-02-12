import { createCanvas, type Image } from 'canvas';
import type {
  TemplateDefinition,
  FrameDefinition,
  LayerDefinition,
  RenderVariables,
  ImageLayer,
  TextLayer,
  RectLayer,
  LogoLayer,
  AccentBarLayer,
} from '../types.js';
import { resolveColor } from '../utils/color.js';
import { wrapText, applyTextTransform } from '../utils/text.js';
import { drawImageCover, drawImageContain } from '../utils/image.js';
import { getFontString } from './font-manager.js';
import { resolveVariables, buildColorVariables } from './layout-engine.js';

export interface PngRenderContext {
  template: TemplateDefinition;
  variables: RenderVariables;
  userImages: Image[];
  logoImage: Image | null;
  frameIndex?: number;
}

export function renderPng(ctx: PngRenderContext): Buffer {
  const { template, variables, userImages, logoImage, frameIndex = 0 } = ctx;
  const frame = template.frames[frameIndex];
  if (!frame) {
    throw new Error(`Frame ${frameIndex} not found in template "${template.id}"`);
  }

  const canvas = createCanvas(template.width, template.height);
  const c = canvas.getContext('2d');
  const colorVars = buildColorVariables(variables);

  // Draw background
  drawBackground(c, frame, template.width, template.height, colorVars, userImages);

  // Draw layers in order (painter's algorithm)
  for (const layer of frame.layers) {
    if (layer.visible === false) continue;
    drawLayer(c, layer, variables, colorVars, userImages, logoImage);
  }

  return canvas.toBuffer('image/png');
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  frame: FrameDefinition,
  w: number,
  h: number,
  colorVars: Record<string, string>,
  userImages: Image[]
) {
  const bg = frame.background;

  switch (bg.type) {
    case 'solid':
      ctx.fillStyle = resolveColor(bg.color, colorVars);
      ctx.fillRect(0, 0, w, h);
      break;

    case 'gradient': {
      const rad = (bg.angle * Math.PI) / 180;
      const x1 = w / 2 - (Math.cos(rad) * w) / 2;
      const y1 = h / 2 - (Math.sin(rad) * h) / 2;
      const x2 = w / 2 + (Math.cos(rad) * w) / 2;
      const y2 = h / 2 + (Math.sin(rad) * h) / 2;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      bg.colors.forEach((color, i) => {
        grad.addColorStop(i / (bg.colors.length - 1), resolveColor(color, colorVars));
      });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }

    case 'image': {
      const img = userImages[bg.index];
      if (img) {
        drawImageCover(ctx, img, 0, 0, w, h);
      }
      break;
    }
  }
}

type CanvasRenderingContext2D = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: LayerDefinition,
  variables: RenderVariables,
  colorVars: Record<string, string>,
  userImages: Image[],
  logoImage: Image | null
) {
  // Apply opacity
  if (layer.opacity !== undefined && layer.opacity < 1) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
  }

  switch (layer.type) {
    case 'rect':
      drawRect(ctx, layer, colorVars);
      break;
    case 'image':
      drawImage(ctx, layer, userImages);
      break;
    case 'text':
      drawText(ctx, layer, variables, colorVars);
      break;
    case 'logo':
      drawLogo(ctx, layer, logoImage);
      break;
    case 'accent_bar':
      drawAccentBar(ctx, layer, colorVars);
      break;
  }

  if (layer.opacity !== undefined && layer.opacity < 1) {
    ctx.restore();
  }
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  layer: RectLayer,
  colorVars: Record<string, string>
) {
  ctx.fillStyle = resolveColor(layer.fill, colorVars);

  if (layer.borderRadius && layer.borderRadius > 0) {
    roundedRect(ctx, layer.x, layer.y, layer.width, layer.height, layer.borderRadius);
    ctx.fill();
  } else {
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
  }

  if (layer.stroke) {
    ctx.strokeStyle = resolveColor(layer.stroke.color, colorVars);
    ctx.lineWidth = layer.stroke.width;
    if (layer.borderRadius && layer.borderRadius > 0) {
      roundedRect(ctx, layer.x, layer.y, layer.width, layer.height, layer.borderRadius);
      ctx.stroke();
    } else {
      ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
    }
  }
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  userImages: Image[]
) {
  const img = userImages[layer.index];
  if (!img) {
    console.warn(`[png-renderer] Missing user image at index ${layer.index}`);
    return;
  }

  // Draw shadow if specified
  if (layer.shadow) {
    ctx.save();
    ctx.shadowBlur = layer.shadow.blur;
    ctx.shadowOffsetX = layer.shadow.offsetX;
    ctx.shadowOffsetY = layer.shadow.offsetY;
    ctx.shadowColor = layer.shadow.color;
  }

  if (layer.fit === 'cover') {
    drawImageCover(ctx, img, layer.x, layer.y, layer.width, layer.height, layer.borderRadius);
  } else {
    drawImageContain(ctx, img, layer.x, layer.y, layer.width, layer.height, layer.borderRadius);
  }

  if (layer.shadow) {
    ctx.restore();
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  variables: RenderVariables,
  colorVars: Record<string, string>
) {
  // Resolve text content
  let text = resolveVariables(layer.content, variables);
  text = applyTextTransform(text, layer.textTransform);

  if (!text) return;

  const fontStr = getFontString(layer.fontSize, layer.fontWeight, layer.fontFamily);
  ctx.font = fontStr;
  ctx.fillStyle = resolveColor(layer.color, colorVars);
  ctx.textBaseline = 'top';

  const padding = layer.padding || 0;
  const maxWidth = layer.width - padding * 2;
  const lineHeight = layer.lineHeight || 1.3;
  const lineSpacing = layer.fontSize * lineHeight;

  // Wrap text
  const lines = wrapText(ctx, text, maxWidth, layer.maxLines);

  // Calculate vertical position
  const totalTextHeight = lines.length * lineSpacing;
  let startY = layer.y + padding;

  if (layer.verticalAlign === 'middle') {
    startY = layer.y + (layer.height - totalTextHeight) / 2;
  } else if (layer.verticalAlign === 'bottom') {
    startY = layer.y + layer.height - totalTextHeight - padding;
  }

  // Draw each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let x = layer.x + padding;

    if (layer.align === 'center') {
      x = layer.x + (layer.width - line.width) / 2;
    } else if (layer.align === 'right') {
      x = layer.x + layer.width - line.width - padding;
    }

    if (layer.letterSpacing) {
      drawTextWithSpacing(ctx, line.text, x, startY + i * lineSpacing, layer.letterSpacing);
    } else {
      ctx.fillText(line.text, x, startY + i * lineSpacing);
    }
  }
}

function drawTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number
) {
  let currentX = x;
  for (const char of text) {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + spacing;
  }
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  layer: LogoLayer,
  logoImage: Image | null
) {
  if (!logoImage) {
    console.warn('[png-renderer] No logo image provided');
    return;
  }

  const padding = layer.padding || 0;

  // Draw background behind logo if specified
  if (layer.background) {
    ctx.fillStyle = layer.background;
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
  }

  const innerX = layer.x + padding;
  const innerY = layer.y + padding;
  const innerW = layer.width - padding * 2;
  const innerH = layer.height - padding * 2;

  if (layer.fit === 'cover') {
    drawImageCover(ctx, logoImage, innerX, innerY, innerW, innerH, layer.borderRadius);
  } else {
    drawImageContain(ctx, logoImage, innerX, innerY, innerW, innerH, layer.borderRadius);
  }
}

function drawAccentBar(
  ctx: CanvasRenderingContext2D,
  layer: AccentBarLayer,
  colorVars: Record<string, string>
) {
  ctx.fillStyle = resolveColor(layer.color, colorVars);
  ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
