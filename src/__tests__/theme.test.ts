import { contrastRatio, heatRamp, mix, readableOn, visibleOn } from '../lib/contrast';
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

describe('chart marks', () => {
  it('mixes colours channel by channel', () => {
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mix('#2563EB', '#FFFFFF', 0)).toBe('#2563EB');
    expect(mix('#2563EB', '#000000', 1)).toBe('#000000');
  });

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('every task colour is visible as a mark on the %s surface (3:1)', (_scheme, c) => {
    for (const color of TASK_COLORS) {
      expect(contrastRatio(visibleOn(color, c.surface), c.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves colours that already pass untouched', () => {
    expect(visibleOn('#2563EB', lightColors.surface)).toBe('#2563EB');
    expect(visibleOn('#5B6475', darkColors.surface)).not.toBe('#5B6475');
  });
});

describe('heat-map ramp', () => {
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('%s: four steps moving away from the surface, the faintest at 2:1 or more', (scheme, c) => {
    for (const color of TASK_COLORS) {
      const ramp = heatRamp(visibleOn(color, c.surface), c.surface, scheme);
      const contrasts = ramp.map((step) => contrastRatio(step, c.surface));
      expect(contrasts[0]).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < ramp.length; i++) expect(contrasts[i]).toBeGreaterThan(contrasts[i - 1]);
    }
  });
});
