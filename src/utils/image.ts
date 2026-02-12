import type { CanvasRenderingContext2D, Image } from 'canvas';

/**
 * Draw an image with cover fit (fills the box, cropping excess)
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: Image,
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadius: number = 0
) {
  ctx.save();

  // Clip to rounded rect if needed
  if (borderRadius > 0) {
    roundedRectPath(ctx, x, y, width, height, borderRadius);
    ctx.clip();
  }

  // Calculate cover fit (crop to fill)
  const imgRatio = img.width / img.height;
  const boxRatio = width / height;

  let sx = 0, sy = 0, sw = img.width, sh = img.height;

  if (imgRatio > boxRatio) {
    // Image is wider — crop sides
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    // Image is taller — crop top/bottom
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}

/**
 * Draw an image with contain fit (fits inside the box, with letterboxing)
 */
export function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: Image,
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadius: number = 0
) {
  ctx.save();

  if (borderRadius > 0) {
    roundedRectPath(ctx, x, y, width, height, borderRadius);
    ctx.clip();
  }

  const imgRatio = img.width / img.height;
  const boxRatio = width / height;

  let dx: number, dy: number, dw: number, dh: number;

  if (imgRatio > boxRatio) {
    // Image is wider — fit to width
    dw = width;
    dh = width / imgRatio;
    dx = x;
    dy = y + (height - dh) / 2;
  } else {
    // Image is taller — fit to height
    dh = height;
    dw = height * imgRatio;
    dx = x + (width - dw) / 2;
    dy = y;
  }

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function roundedRectPath(
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
