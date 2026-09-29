// Light theme only in Phase 0; dark mode arrives with Settings in Phase 1.
export const colors = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#11181C',
  textMuted: '#687076',
  border: '#E3E6EA',
  track: '#E8EBEF',
  primary: '#2563EB',
  danger: '#C5221F',
  positive: '#15803D',
  scrim: 'rgba(17, 24, 28, 0.45)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Each has at least 4.5:1 contrast with white text (WCAG AA); checked in theme.test.ts. */
export const TASK_COLORS = [
  '#DC2626',
  '#C2410C',
  '#15803D',
  '#0F766E',
  '#2563EB',
  '#6E56CF',
  '#C2298A',
  '#5B6475',
] as const;

export const TASK_EMOJIS = ['💪', '🦵', '🏃', '🚴', '🏋️', '🧘', '📖', '💧', '✍️', '🎯'] as const;
