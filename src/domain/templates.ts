import { addDays } from './days';
import type { TaskFormValues } from './input';
import type { Measure } from './measure';
import { ALL_WEEKDAYS_MASK, type Recurrence } from './periods';

// Built-in starter goals for the New task screen (SPEC §10, Phase 5). Names,
// units and one-line summaries are translated (i18n `templates.<id>`); picking
// one fills the form, which the user can still change before saving.

export type TemplateId =
  'pushups' | 'squats' | 'water' | 'running' | 'plank' | 'reading' | 'cycling' | 'meditation';

export type Template = {
  id: TemplateId;
  emoji: string;
  color: string;
  measure: Measure;
  recurrence: Recurrence;
  /** Units, or minutes for time goals (as typed in the form). */
  target: number;
  /** Units, or minutes for time goals. */
  increments: number[];
  /** A total goal with a deadline: the end date is this many days from today, inclusive. */
  days?: number;
};

export const TEMPLATES: readonly Template[] = [
  {
    id: 'pushups',
    emoji: '💪',
    color: '#DC2626',
    measure: 'count',
    recurrence: 'daily',
    target: 100,
    increments: [-1, 1, 5, 10],
  },
  {
    id: 'squats',
    emoji: '🦵',
    color: '#C2410C',
    measure: 'count',
    recurrence: 'none',
    target: 1000,
    increments: [-1, 5, 10, 20],
    days: 30,
  },
  {
    id: 'water',
    emoji: '💧',
    color: '#0F766E',
    measure: 'count',
    recurrence: 'daily',
    target: 8,
    increments: [-1, 1],
  },
  {
    id: 'running',
    emoji: '🏃',
    color: '#15803D',
    measure: 'count',
    recurrence: 'weekly',
    target: 20,
    increments: [1, 2, 5],
  },
  {
    id: 'plank',
    emoji: '🏋️',
    color: '#6E56CF',
    measure: 'duration',
    recurrence: 'daily',
    target: 5,
    increments: [1, 2],
  },
  {
    id: 'reading',
    emoji: '📖',
    color: '#2563EB',
    measure: 'count',
    recurrence: 'daily',
    target: 20,
    increments: [1, 5, 10],
  },
  {
    id: 'cycling',
    emoji: '🚴',
    color: '#C2298A',
    measure: 'count',
    recurrence: 'monthly',
    target: 300,
    increments: [5, 10, 20],
  },
  {
    id: 'meditation',
    emoji: '🧘',
    color: '#5B6475',
    measure: 'duration',
    recurrence: 'daily',
    target: 10,
    increments: [1, 5],
  },
];

/** The New task form, filled from a template. `text` is the translated name and unit. */
export function templateForm(
  template: Template,
  text: { name: string; unit: string },
  startDate: string,
): TaskFormValues {
  return {
    name: text.name,
    emoji: template.emoji,
    color: template.color,
    measure: template.measure,
    unitLabel: template.measure === 'duration' ? '' : text.unit,
    target: String(template.target),
    targetUnit: 'format',
    increments: template.increments.join(', '),
    recurrence: template.recurrence,
    weekdayMask: ALL_WEEKDAYS_MASK,
    endDate: template.days !== undefined ? addDays(startDate, template.days - 1) : null,
    dayStartMin: null,
    reminderTime: null,
    description: '',
  };
}
