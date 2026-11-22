import { TASK_COLORS, TASK_EMOJIS } from '../../theme';
import { validateTaskForm } from '../input';
import { isLongNote, MAX_NOTE_LENGTH, noteSuggestions, normalizeNote } from '../notes';
import { moveItem, type Ordered } from '../order';
import { TEMPLATES, templateForm } from '../templates';

describe('normalizeNote', () => {
  it('trims and collapses whitespace, including newlines', () => {
    expect(normalizeNote('  felt   tired \n today ')).toBe('felt tired\ntoday');
  });

  it('turns empty or missing text into null', () => {
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('   \n ')).toBeNull();
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNote(undefined)).toBeNull();
  });

  it('caps the length without leaving a trailing space', () => {
    const long = `${'a'.repeat(MAX_NOTE_LENGTH - 1)} bcd`;
    const note = normalizeNote(long);
    expect(note).toBe('a'.repeat(MAX_NOTE_LENGTH - 1));
    expect(normalizeNote('x'.repeat(MAX_NOTE_LENGTH + 500))).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('keeps line breaks, with at most one blank line in a row', () => {
    expect(normalizeNote('one\r\ntwo\n\n\n\n three \t four')).toBe('one\ntwo\n\nthree four');
  });

  it('decides which notes are previewed', () => {
    expect(isLongNote('felt tired')).toBe(false);
    expect(isLongNote('a'.repeat(80))).toBe(false);
    expect(isLongNote('a'.repeat(81))).toBe(true);
    expect(isLongNote('two\nlines')).toBe(true);
  });
});

describe('noteSuggestions', () => {
  it('puts recent notes first, then the built-in ones, without duplicates', () => {
    expect(
      noteSuggestions(['Knee hurt', 'new record', 'Knee hurt '], ['Felt tired', 'New record', 'Felt great']),
    ).toEqual(['Knee hurt', 'new record', 'Felt tired', 'Felt great']);
  });

  it('leaves long notes out of the chips', () => {
    expect(noteSuggestions(['a'.repeat(41), 'two\nlines', 'short'], [])).toEqual(['short']);
  });

  it('stops at the limit', () => {
    expect(noteSuggestions(['a', 'b', 'c'], ['d', 'e'], 4)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('moveItem', () => {
  const list: Ordered[] = [
    { id: 'a', sortOrder: 1 },
    { id: 'b', sortOrder: 2 },
    { id: 'c', sortOrder: 3 },
    { id: 'd', sortOrder: 4 },
  ];
  const apply = (items: Ordered[], updates: Ordered[]) =>
    items
      .map((item) => updates.find((u) => u.id === item.id) ?? item)
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((item) => item.id)
      .join('');

  it('changes only the moved task, placing it between its new neighbours', () => {
    expect(moveItem(list, 2, -1)).toEqual([{ id: 'c', sortOrder: 1.5 }]);
    expect(moveItem(list, 1, 1)).toEqual([{ id: 'b', sortOrder: 3.5 }]);
    expect(apply(list, moveItem(list, 2, -1))).toBe('acbd');
  });

  it('goes past the end neighbour at either edge', () => {
    expect(moveItem(list, 1, -1)).toEqual([{ id: 'b', sortOrder: 0 }]);
    expect(moveItem(list, 2, 1)).toEqual([{ id: 'c', sortOrder: 5 }]);
    expect(apply(list, moveItem(list, 2, 1))).toBe('abdc');
  });

  it('does nothing past either end', () => {
    expect(moveItem(list, 0, -1)).toEqual([]);
    expect(moveItem(list, 3, 1)).toEqual([]);
    expect(moveItem(list, 7, 1)).toEqual([]);
  });

  it('works on gappy orders, as after deletions or imports', () => {
    const gappy = [
      { id: 'a', sortOrder: -3 },
      { id: 'b', sortOrder: 10 },
      { id: 'c', sortOrder: 11.25 },
    ];
    expect(moveItem(gappy, 2, -1)).toEqual([{ id: 'c', sortOrder: 3.5 }]);
  });

  it('renumbers when two tasks share a value', () => {
    const tied = [
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
      { id: 'c', sortOrder: 2 },
      { id: 'd', sortOrder: 3 },
    ];
    // No room between b and c (both 2): renumber 1..4, and only rows whose value changes are written.
    const updates = moveItem(tied, 3, -1);
    expect(updates).toEqual([{ id: 'c', sortOrder: 4 }]);
    expect(apply(tied, updates)).toBe('abdc');
  });

  it('keeps working after many moves into the same gap', () => {
    let items = [...list];
    for (let n = 0; n < 200; n++) {
      // Move whatever is third up to second, over and over: halves the same gap each time.
      const updates = moveItem(items, 2, -1);
      items = items
        .map((item) => updates.find((u) => u.id === item.id) ?? item)
        .sort((x, y) => x.sortOrder - y.sortOrder);
      const orders = items.map((i) => i.sortOrder);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s fills a valid form', (_id, template) => {
    const form = templateForm(template, { name: 'Name', unit: 'unit' }, '2026-10-01');
    const result = validateTaskForm(form, '2026-10-01');
    expect(result.ok).toBe(true);
    expect(TASK_COLORS as readonly string[]).toContain(template.color);
    expect(TASK_EMOJIS as readonly string[]).toContain(template.emoji);
  });

  it('turns a deadline into an inclusive end date and ignores units for time goals', () => {
    const squats = TEMPLATES.find((t) => t.id === 'squats')!;
    expect(templateForm(squats, { name: 'Squats', unit: 'reps' }, '2026-10-01').endDate).toBe('2026-10-30');
    const plank = TEMPLATES.find((t) => t.id === 'plank')!;
    const form = templateForm(plank, { name: 'Plank', unit: 'ignored' }, '2026-10-01');
    expect(form).toMatchObject({ unitLabel: '', target: '5', increments: '1, 2', endDate: null });
    const result = validateTaskForm(form, '2026-10-01');
    expect(result.ok && result.value.target).toBe(300);
  });

  it('has unique ids', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });
});
