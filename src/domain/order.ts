// Manual task order (SPEC §10, Phase 5). tasks.sort_order is a real number, so
// a move gives only the moved task a new value between its new neighbours: one
// changed row, which keeps future sync merges small. If the gap has run out of
// floating-point room (or two tasks share a value), the list is renumbered.

export type Ordered = { id: string; sortOrder: number };

/**
 * New sort orders after moving `items[index]` one place up (−1) or down (+1).
 * `items` is the visible order. Returns only the rows that change; empty when
 * the move goes past either end.
 */
export function moveItem(items: readonly Ordered[], index: number, direction: -1 | 1): Ordered[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [];
  const moved = items[index];
  const others = items.filter((_, i) => i !== index);
  const before = others[target - 1];
  const after = others[target];

  let value: number;
  if (before === undefined) value = after.sortOrder - 1;
  else if (after === undefined) value = before.sortOrder + 1;
  else value = (before.sortOrder + after.sortOrder) / 2;

  const fits =
    (before === undefined || value > before.sortOrder) && (after === undefined || value < after.sortOrder);
  if (fits) return [{ id: moved.id, sortOrder: value }];

  const reordered = [...others.slice(0, target), moved, ...others.slice(target)];
  return reordered
    .map((item, i) => ({ id: item.id, sortOrder: i + 1 }))
    .filter((item, i) => item.sortOrder !== reordered[i].sortOrder);
}
