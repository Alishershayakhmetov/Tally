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
    ['', 'Add at least one button'],
    ['1, 0', '"0" is not a non-zero whole number'],
    ['1, 1', '1 appears twice'],
    ['1, 2, 3, 4, 5, 6, 7', 'At most 6 buttons'],
    ['1, x', '"x" is not a non-zero whole number'],
  ])('rejects %p', (text, error) => {
    expect(parseIncrements(text)).toEqual({ ok: false, error });
  });
});

describe('validateTaskForm', () => {
  const valid: TaskFormValues = {
    name: '  Push-ups ',
    emoji: '💪',
    color: '#E5484D',
    unitLabel: ' push-ups ',
    target: '1000',
    increments: '-1, 1, 5, 10',
  };

  it('trims and converts a valid form', () => {
    expect(validateTaskForm(valid)).toEqual({
      ok: true,
      value: {
        name: 'Push-ups',
        emoji: '💪',
        color: '#E5484D',
        unitLabel: 'push-ups',
        target: 1000,
        increments: [-1, 1, 5, 10],
      },
    });
  });

  it('stores an empty unit label as null', () => {
    const result = validateTaskForm({ ...valid, unitLabel: '   ' });
    expect(result.ok && result.value.unitLabel).toBeNull();
  });

  it('collects every field error at once', () => {
    const result = validateTaskForm({ ...valid, name: ' ', target: '0', increments: '' });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['increments', 'name', 'target']);
  });
});
