import { createInstance } from 'i18next';

import { TEMPLATES } from '@/domain/templates';

import en from '../en.json';
import ru from '../ru.json';

type Tree = { [key: string]: string | string[] | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Flattened keys with plural suffixes removed, so "daysLeft_one" and "daysLeft_few" both count as "daysLeft". */
function keys(tree: Tree, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key.replace(PLURAL_SUFFIX, '')}`;
    if (typeof value === 'object' && !Array.isArray(value))
      keys(value, `${path}.`).forEach((k) => out.add(k));
    else out.add(path);
  }
  return out;
}

function pluralForms(tree: Tree, base: string): string[] {
  const [section, key] = base.split('.');
  return Object.keys(tree[section] as Tree)
    .filter((k) => k.replace(PLURAL_SUFFIX, '') === key && PLURAL_SUFFIX.test(k))
    .map((k) => k.match(PLURAL_SUFFIX)![1])
    .sort();
}

describe('translations', () => {
  it('English and Russian define the same keys', () => {
    expect([...keys(ru as Tree)].sort()).toEqual([...keys(en as Tree)].sort());
  });

  it.each([
    'goal.daysLeft',
    'goal.daysMet',
    'goal.weeksMet',
    'goal.monthsMet',
    'streak.days',
    'streak.weeks',
    'streak.months',
    'streak.bestDays',
    'streak.bestWeeks',
    'streak.bestMonths',
    'stats.days',
    'stats.weeks',
    'stats.months',
  ])('%s has every plural form each language needs', (key) => {
    expect(pluralForms(en as Tree, key)).toEqual(['one', 'other']);
    expect(pluralForms(ru as Tree, key)).toEqual(['few', 'many', 'one', 'other']);
  });

  it('every template has a name, unit and summary in both languages', () => {
    for (const lang of [en, ru] as Tree[]) {
      const section = lang.templates as Tree;
      for (const { id } of TEMPLATES) {
        const entry = section[id] as Tree;
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.unit).toBe('string');
        expect(typeof entry.summary).toBe('string');
      }
    }
  });

  it('note suggestions are lists of the same length', () => {
    expect(en.notes.suggestions.length).toBeGreaterThan(0);
    expect(ru.notes.suggestions).toHaveLength(en.notes.suggestions.length);
  });

  it('month and weekday lists are complete', () => {
    for (const lang of [en, ru]) {
      expect(lang.date.monthsShort).toHaveLength(12);
      expect(lang.date.monthsLong).toHaveLength(12);
      expect(lang.date.weekdaysShort).toHaveLength(7);
      expect(lang.date.weekdaysLong).toHaveLength(7);
    }
  });

  it('has a message for every input error code', () => {
    const codes = [
      'amountNotInteger',
      'durationInvalid',
      'durationTargetInvalid',
      'reminderInvalid',
      'amountZero',
      'amountTooLarge',
      'targetInvalid',
      'targetTooLarge',
      'incrementsEmpty',
      'incrementsTooMany',
      'incrementInvalid',
      'incrementTooLarge',
      'incrementDuplicate',
      'nameRequired',
      'nameTooLong',
      'unitTooLong',
      'weekdaysEmpty',
      'endBeforeStart',
      'dayStartInvalid',
    ];
    expect(Object.keys(en.errors).sort()).toEqual([...codes].sort());
  });
});

describe('Russian plurals through i18next', () => {
  it('picks one / few / many', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'ru', resources: { ru: { translation: ru } }, initAsync: false });
    expect(i18n.t('goal.daysLeft', { count: 1 })).toBe('Остался 1 день');
    expect(i18n.t('goal.daysLeft', { count: 3 })).toBe('Осталось 3 дня');
    expect(i18n.t('goal.daysLeft', { count: 5 })).toBe('Осталось 5 дней');
    expect(i18n.t('goal.daysLeft', { count: 21 })).toBe('Остался 21 день');
    expect(i18n.t('goal.daysMet', { met: 18, count: 30 })).toBe('Выполнено 18 из 30 дней');
    expect(i18n.t('goal.daysMet', { met: 1, count: 21 })).toBe('Выполнено 1 из 21 дня');
  });
});
