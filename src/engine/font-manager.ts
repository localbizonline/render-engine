import { registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.resolve(__dirname, '../../fonts');

export function initFonts() {
  registerFont(path.join(fontsDir, 'Inter-Regular.ttf'), {
    family: 'Inter',
    weight: 'normal',
  });
  registerFont(path.join(fontsDir, 'Inter-Medium.ttf'), {
    family: 'Inter',
    weight: '500',
  });
  registerFont(path.join(fontsDir, 'Inter-SemiBold.ttf'), {
    family: 'Inter',
    weight: '600',
  });
  registerFont(path.join(fontsDir, 'Inter-Bold.ttf'), {
    family: 'Inter',
    weight: 'bold',
  });
}

const WEIGHT_MAP: Record<string, string> = {
  regular: 'normal',
  medium: '500',
  semibold: '600',
  bold: 'bold',
};

export function getFontString(
  fontSize: number,
  fontWeight: string,
  fontFamily: string
): string {
  const weight = WEIGHT_MAP[fontWeight] || fontWeight;
  return `${weight} ${fontSize}px "${fontFamily}"`;
}
