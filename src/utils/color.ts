export function resolveColor(
  color: string,
  variables: Record<string, string>
): string {
  // Replace template variables like {{primary_colour}}
  if (color.startsWith('{{') && color.endsWith('}}')) {
    const key = color.slice(2, -2).trim();
    return variables[key] || '#000000';
  }
  // Handle $variable shorthand
  if (color.startsWith('$')) {
    const key = color.slice(1);
    return variables[key] || '#000000';
  }
  return color;
}

export function hexToRgba(hex: string, alpha: number = 1): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
