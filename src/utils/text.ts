import type { CanvasRenderingContext2D } from 'canvas';

export interface WrappedLine {
  text: string;
  width: number;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines?: number
): WrappedLine[] {
  const words = text.split(' ');
  const lines: WrappedLine[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      const lineMetrics = ctx.measureText(currentLine);
      lines.push({ text: currentLine, width: lineMetrics.width });
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    const lineMetrics = ctx.measureText(currentLine);
    lines.push({ text: currentLine, width: lineMetrics.width });
  }

  // Truncate to maxLines with ellipsis
  if (maxLines && lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    const lastLine = truncated[maxLines - 1];
    let text = lastLine.text;

    // Add ellipsis
    while (ctx.measureText(text + '...').width > maxWidth && text.length > 0) {
      text = text.slice(0, -1).trimEnd();
    }
    truncated[maxLines - 1] = {
      text: text + '...',
      width: ctx.measureText(text + '...').width,
    };
    return truncated;
  }

  return lines;
}

export function applyTextTransform(
  text: string,
  transform?: 'uppercase' | 'lowercase' | 'none'
): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    default:
      return text;
  }
}
