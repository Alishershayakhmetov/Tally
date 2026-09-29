export type Colors = {
  scheme: 'light' | 'dark';
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  track: string;
  primary: string;
  danger: string;
  positive: string;
  scrim: string;
  snackbar: string;
  snackbarText: string;
  snackbarAction: string;
};

export const lightColors: Colors = {
  scheme: 'light',
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
  snackbar: '#11181C',
  snackbarText: '#FFFFFF',
  snackbarAction: '#7CC4FF',
};

export const darkColors: Colors = {
  scheme: 'dark',
  background: '#0E1113',
  surface: '#1A1E22',
  text: '#ECEEF0',
  textMuted: '#9BA1A6',
  border: '#2B3035',
  track: '#2B3035',
  primary: '#2563EB',
  danger: '#F87171',
  positive: '#4ADE80',
  scrim: 'rgba(0, 0, 0, 0.6)',
  snackbar: '#ECEEF0',
  snackbarText: '#11181C',
  snackbarAction: '#1D4ED8',
};

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
