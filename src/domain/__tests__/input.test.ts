import {
  DEFAULT_INCREMENTS,
  parseAmount,
  parseIncrements,
  parseSignedInt,
  parseTarget,
  validateTaskForm,
  type TaskFormValues,
} from '../input';

describe('parseSignedInt', () => {
  it.each([
    ['37', 37],
    [' 37 ', 37],
    ['+5', 5],
    ['-5', -5],
    ['−5', -5],
    ['1 000', 1000],
    ['0', 0],
  ])('%p → %p', (text, expected) => {
    expect(parseSignedInt(text)).toBe(expected);
  });

  it.each(['', '-', 'abc', '3.5', '1e3', '--1', '5-'])('rejects %p', (text) => {
    expect(parseSignedInt(text)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('accepts negative corrections', () => {
    expect(parseAmount('-12')).toEqual({ ok: true, value: -12 });
  });

  it.each(['0', 'abc', '3.5', '2000000000'])('rejects %p', (text) => {
    expect(parseAmount(text).ok).toBe(false);
  });
});

describe('parseTarget', () => {
  it('accepts a positive whole number', () => {
    expect(parseTarget('1000')).toEqual({ ok: true, value: 1000 });
  });

  it.each(['0', '-5', '', '10.5'])('rejects %p', (text) => {
    expect(parseTarget(text).ok).toBe(false);
  });
});

describe('parseIncrements', () => {
  it('parses the default set', () => {
    expect(parseIncrements('-1, 1, 5, 10')).toEqual({ ok: true, value: DEFAULT_INCREMENTS });
  });

  it('accepts spaces, plus signs and any order, and sorts the result', () => {
    expect(parseIncrements('+10 +5 -1 +1')).toEqual({ ok: true, value: [-1, 1, 5, 10] });
  });

  it.each([
    ['', { code: 'incrementsEmpty' }],
    ['1, 0', { code: 'incrementInvalid', params: { value: '0' } }],
    ['1, 1', { code: 'incrementDuplicate', params: { value: '1' } }],
    ['1, 2, 3, 4, 5, 6, 7', { code: 'incrementsTooMany', params: { max: 6 } }],
    ['1, x', { code: 'incrementInvalid', params: { value: 'x' } }],
  ])('rejects %p', (text, error) => {
    expect(parseIncrements(text)).toEqual({ ok: false, error });
  });
});

describe('validateTaskForm', () => {
  const TODAY = '2026-09-29';
  const valid: TaskFormValues = {
    name: '  Push-ups ',
    emoji: '💪',
    color: '#E5484D',
    unitLabel: ' push-ups ',
    target: '1000',
    increments: '-1, 1, 5, 10',
    recurrence: 'none',
    weekdayMask: 127,
    endDate: null,
    dayStartMin: null,
  };

  it('trims and converts a valid form', () => {
    expect(validateTaskForm(valid, TODAY)).toEqual({
      ok: true,
      value: {
        name: 'Push-ups',
        emoji: '💪',
        color: '#E5484D',
        unitLabel: 'push-ups',
        target: 1000,
        increments: [-1, 1, 5, 10],
        recurrence: 'none',
        weekdayMask: null,
        endDate: null,
        dayStartMin: null,
      },
    });
  });

  it('stores an empty unit label as null', () => {
    const result = validateTaskForm({ ...valid, unitLabel: '   ' }, TODAY);
    expect(result.ok && result.value.unitLabel).toBeNull();
  });

  it('collects every field error at once', () => {
    const result = validateTaskForm({ ...valid, name: ' ', target: '0', increments: '' }, TODAY);
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['increments', 'name', 'target']);
  });

  it('keeps a weekday mask only for daily goals, and only when it excludes days', () => {
    const monWed = 1 | 4;
    const daily = validateTaskForm({ ...valid, recurrence: 'daily', weekdayMask: monWed }, TODAY);
    expect(daily.ok && daily.value.weekdayMask).toBe(monWed);
    const everyDay = validateTaskForm({ ...valid, recurrence: 'daily', weekdayMask: 127 }, TODAY);
    expect(everyDay.ok && everyDay.value.weekdayMask).toBeNull();
    const weekly = validateTaskForm({ ...valid, recurrence: 'weekly', weekdayMask: monWed }, TODAY);
    expect(weekly.ok && weekly.value.weekdayMask).toBeNull();
  });

  it('requires at least one day for a daily goal', () => {
    const result = validateTaskForm({ ...valid, recurrence: 'daily', weekdayMask: 0 }, TODAY);
    expect(!result.ok && result.errors.weekdayMask).toEqual({ code: 'weekdaysEmpty' });
  });

  it('rejects an end date before the start, and accepts the start day itself', () => {
    const early = validateTaskForm({ ...valid, endDate: '2026-09-28' }, TODAY);
    expect(!early.ok && early.errors.endDate).toEqual({ code: 'endBeforeStart', params: { date: TODAY } });
    expect(validateTaskForm({ ...valid, endDate: TODAY }, TODAY).ok).toBe(true);
  });

  it('validates a per-task day start', () => {
    expect(validateTaskForm({ ...valid, dayStartMin: 240 }, TODAY).ok).toBe(true);
    const bad = validateTaskForm({ ...valid, dayStartMin: 800 }, TODAY);
    expect(!bad.ok && bad.errors.dayStartMin).toEqual({ code: 'dayStartInvalid' });
  });
});
