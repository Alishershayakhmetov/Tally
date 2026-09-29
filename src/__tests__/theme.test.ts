import { colors, TASK_COLORS } from '../theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme contrast (WCAG AA, 4.5:1)', () => {
  it.each([...TASK_COLORS, colors.primary])('white text on %s', (color) => {
    expect(contrast('#FFFFFF', color)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['text', colors.text],
    ['textMuted', colors.textMuted],
    ['danger', colors.danger],
    ['positive', colors.positive],
  ])('%s on the background', (_name, color) => {
    expect(contrast(color, colors.background)).toBeGreaterThanOrEqual(4.5);
  });
});
