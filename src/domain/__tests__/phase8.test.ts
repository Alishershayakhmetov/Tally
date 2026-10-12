import { contrastRatio, normalizeHex, textOn } from '../../lib/contrast';
import { TASK_COLORS, TASK_EMOJIS } from '../../theme';
import { EMOJI_CATEGORIES, MAX_EMOJI_LENGTH, normalizeEmoji } from '../emoji';
import { moveTo, type Ordered } from '../order';

describe('emoji catalog', () => {
  const all = EMOJI_CATEGORIES.flatMap((category) => category.emojis);

  it('lists every emoji once', () => {
    const seen = new Set<string>();
    const duplicates = all.filter((emoji) => (seen.has(emoji) ? true : (seen.add(emoji), false)));
    expect(duplicates).toEqual([]);
  });

  it('has a decent choice in every category', () => {
    for (const category of EMOJI_CATEGORIES) expect(category.emojis.length).toBeGreaterThanOrEqual(20);
    expect(all.length).toBeGreaterThanOrEqual(200);
  });

  it('accepts each of its own emoji as a typed icon', () => {
    for (const emoji of [...all, ...TASK_EMOJIS]) expect(normalizeEmoji(emoji)).toBe(emoji);
  });
});

describe('normalizeEmoji', () => {
  it('keeps any emoji, including flags, keycaps and joined sequences', () => {
    expect(normalizeEmoji(' 🦄 ')).toBe('🦄');
    expect(normalizeEmoji('🇰🇿')).toBe('🇰🇿');
    expect(normalizeEmoji('1️⃣')).toBe('1️⃣');
    expect(normalizeEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
  });

  it('rejects text that is not an emoji', () => {
    for (const text of ['', '   ', 'abc', 'A', '42', 'Ж', '🦄 🦄']) expect(normalizeEmoji(text)).toBeNull();
    expect(normalizeEmoji('🦄'.repeat(MAX_EMOJI_LENGTH))).toBeNull();
  });
});

describe('moveTo', () => {
  const list: Ordered[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, sortOrder: i + 1 }));
  const apply = (items: readonly Ordered[], updates: readonly Ordered[]) =>
    items
      .map((item) => updates.find((u) => u.id === item.id) ?? item)
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((item) => item.id)
      .join('');

  it('drops a task anywhere with one changed row', () => {
    expect(moveTo(list, 4, 1)).toEqual([{ id: 'e', sortOrder: 1.5 }]);
    expect(apply(list, moveTo(list, 4, 1))).toBe('aebcd');
    expect(apply(list, moveTo(list, 0, 3))).toBe('bcdae');
    expect(apply(list, moveTo(list, 1, 4))).toBe('acdeb');
    expect(apply(list, moveTo(list, 3, 0))).toBe('dabce');
  });

  it('does nothing for a drop in place or out of range', () => {
    expect(moveTo(list, 2, 2)).toEqual([]);
    expect(moveTo(list, -1, 2)).toEqual([]);
    expect(moveTo(list, 2, 5)).toEqual([]);
  });

  it('renumbers when the neighbours share a value', () => {
    const tied: Ordered[] = [
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
      { id: 'c', sortOrder: 2 },
      { id: 'd', sortOrder: 3 },
    ];
    const updates = moveTo(tied, 3, 2);
    expect(apply(tied, updates)).toBe('abdc');
  });
});

describe('textOn', () => {
  it('keeps white text on every built-in task colour', () => {
    for (const color of TASK_COLORS) expect(textOn(color)).toBe('#FFFFFF');
  });

  it('switches to dark text on light custom colours, and stays readable', () => {
    for (const color of ['#FFE066', '#A7F3D0', '#FFFFFF', '#F9A8D4']) expect(textOn(color)).toBe('#111111');
    for (const color of ['#FFE066', '#000000', '#7C3AED', '#22C55E', '#FB923C']) {
      expect(contrastRatio(textOn(color), color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('normalizeHex', () => {
  it('stores picker colours as #RRGGBB in capitals, dropping alpha', () => {
    expect(normalizeHex('#a7f3d0')).toBe('#A7F3D0');
    expect(normalizeHex('a7f3d0')).toBe('#A7F3D0');
    expect(normalizeHex('#a7f3d0ff')).toBe('#A7F3D0');
  });

  it('rejects anything else', () => {
    for (const text of ['', '#abc', 'red', 'rgb(1, 2, 3)', '#GGGGGG']) expect(normalizeHex(text)).toBeNull();
  });
});
