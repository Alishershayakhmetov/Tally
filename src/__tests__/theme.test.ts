import { contrastRatio, readableOn } from '../lib/contrast';
import { darkColors, lightColors, TASK_COLORS } from '../theme';

describe('theme contrast (WCAG AA, 4.5:1)', () => {
  it.each([...TASK_COLORS, lightColors.primary])('white text on %s', (color) => {
    expect(contrastRatio('#FFFFFF', color)).toBeGreaterThanOrEqual(4.5);
  });

  describe.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('%s theme', (_scheme, c) => {
    it.each(['text', 'textMuted', 'danger', 'positive'] as const)('%s on background and surface', (key) => {
      expect(contrastRatio(c[key], c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c[key], c.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('snackbar text and action', () => {
      expect(contrastRatio(c.snackbarText, c.snackbar)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.snackbarAction, c.snackbar)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(TASK_COLORS)('task colour %s as text is readable or falls back', (color) => {
      expect(contrastRatio(readableOn(color, c.surface, c.text), c.surface)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
