// Manual task order (SPEC §10, Phases 5 and 8). tasks.sort_order is a real number, so
// a move gives only the moved task a new value between its new neighbours: one
// changed row, which keeps future sync merges small. If the gap has run out of
// floating-point room (or two tasks share a value), the list is renumbered.

export type Ordered = { id: string; sortOrder: number };

/**
 * New sort orders after moving `items[from]` so that it ends up at position
 * `to` (drag and drop on Home). `items` is the visible order. Returns only the
 * rows that change; empty when nothing moves or an index is out of range.
 */
export function moveTo(items: readonly Ordered[], from: number, to: number): Ordered[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return [];
  const moved = items[from];
  const others = items.filter((_, i) => i !== from);
  const before = others[to - 1];
  const after = others[to];

  let value: number;
  if (before === undefined) value = after.sortOrder - 1;
  else if (after === undefined) value = before.sortOrder + 1;
  else value = (before.sortOrder + after.sortOrder) / 2;

  const fits =
    (before === undefined || value > before.sortOrder) && (after === undefined || value < after.sortOrder);
  if (fits) return [{ id: moved.id, sortOrder: value }];

  const reordered = [...others.slice(0, to), moved, ...others.slice(to)];
  return reordered
    .map((item, i) => ({ id: item.id, sortOrder: i + 1 }))
    .filter((item, i) => item.sortOrder !== reordered[i].sortOrder);
}

/** One place up (−1) or down (+1): the screen-reader actions on a Home card. */
export function moveItem(items: readonly Ordered[], index: number, direction: -1 | 1): Ordered[] {
  return moveTo(items, index, index + direction);
}
