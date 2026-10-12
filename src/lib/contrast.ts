function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color` if it is readable as text on `background` (AA, 4.5:1), otherwise `fallback`. */
export function readableOn(color: string, background: string, fallback: string): string {
  return contrastRatio(color, background) >= 4.5 ? color : fallback;
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** `from` blended toward `to` by `amount` (0 = from, 1 = to), as #RRGGBB. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

/**
 * `color` for a chart mark (bar, filled cell) on `surface`: kept as is when it
 * reaches `min` (3:1 for graphics), otherwise nudged toward white or black,
 * whichever stands out more, until it does. The hue stays recognisable.
 */
export function visibleOn(color: string, surface: string, min = 3): string {
  const target =
    contrastRatio('#FFFFFF', surface) > contrastRatio('#000000', surface) ? '#FFFFFF' : '#000000';
  for (let step = 0; step <= 10; step++) {
    const candidate = mix(color, target, step / 10);
    if (contrastRatio(candidate, surface) >= min) return candidate;
  }
  return target;
}

/** Whichever of `light` and `dark` reads better on `background` (for text inside a filled mark). */
export function inkOn(background: string, light: string, dark: string): string {
  return contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
}

/** A colour from the picker as the stored task colour, #RRGGBB in capitals; null if it isn't one. */
export function normalizeHex(color: string): string | null {
  const match = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(color.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}

/**
 * Text on a filled task colour (buttons, chips, badges). Tasks can have any
 * colour, so white is only used when it reads better than near-black; every
 * built-in task colour keeps white.
 */
export function textOn(color: string): string {
  return inkOn(color, '#FFFFFF', '#111111');
}

/** How much of the top colour each heat-map step blends into the surface. */
const RAMP_STEPS = [0.45, 0.62, 0.78, 1];

/**
 * Four steps of one hue for a heat map, faint to strong. The strongest step is
 * pushed away from the surface (a little darker on light, lighter on dark) so the
 * steps span enough lightness, and the faintest still clears 2:1 against the
 * surface. Checked for every task colour with the dataviz ordinal-ramp checks.
 */
export function heatRamp(color: string, surface: string, scheme: 'light' | 'dark'): string[] {
  const top = scheme === 'dark' ? mix(color, '#FFFFFF', 0.3) : mix(color, '#000000', 0.1);
  return RAMP_STEPS.map((step) => mix(surface, top, step));
}
