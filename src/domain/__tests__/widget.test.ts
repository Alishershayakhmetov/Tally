import type { Lifecycle } from '../goal';
import {
  groupWidgetTaps,
  WIDGET_MAX_ROWS,
  widgetRowsForHeight,
  widgetStep,
  widgetTasks,
  type WidgetTap,
} from '../widget';

describe('widgetStep', () => {
  it("is the task's smallest + button", () => {
    expect(widgetStep('count', [-1, 1, 5, 10])).toBe(1);
    expect(widgetStep('count', [-1, 5, 10, 20])).toBe(5);
    expect(widgetStep('count', [20, 5])).toBe(5);
  });

  it('is in seconds for time goals, whose buttons are minutes', () => {
    expect(widgetStep('duration', [-1, 1, 5])).toBe(60);
    expect(widgetStep('duration', [5, 10])).toBe(300);
  });

  it('is null without a + button', () => {
    expect(widgetStep('count', [-1, -5])).toBeNull();
    expect(widgetStep('count', [])).toBeNull();
  });
});

describe('widgetTasks', () => {
  const view = (id: string, lifecycle: Lifecycle) => ({ id, lifecycle });

  it('takes active tasks in Home order, up to the limit', () => {
    const views = [
      view('a', 'active'),
      view('done', 'finished'),
      view('b', 'active'),
      view('hidden', 'archived'),
      view('c', 'active'),
      view('d', 'active'),
    ];
    expect(widgetTasks(views).map((v) => v.id)).toEqual(['a', 'b', 'c']);
    expect(widgetTasks(views, 1).map((v) => v.id)).toEqual(['a']);
  });

  it('is empty without active tasks', () => {
    expect(widgetTasks([view('x', 'finished')])).toEqual([]);
  });
});

describe('widgetRowsForHeight', () => {
  it('fits one row per 56 dp after padding, between 1 and the maximum', () => {
    expect(widgetRowsForHeight(40)).toBe(1);
    expect(widgetRowsForHeight(72)).toBe(1);
    expect(widgetRowsForHeight(128)).toBe(2);
    expect(widgetRowsForHeight(184)).toBe(3);
    expect(widgetRowsForHeight(600)).toBe(WIDGET_MAX_ROWS);
  });
});

describe('groupWidgetTaps', () => {
  const T0 = 1_790_000_000_000;
  // Days start at T0 + 10 min here, so the boundary is easy to cross.
  const dayOf = (_taskId: string, at: number) => (at < T0 + 600_000 ? '2026-10-03' : '2026-10-04');
  const tap = (taskId: string, offsetMs: number, amount = 1): WidgetTap => ({
    taskId,
    at: T0 + offsetMs,
    amount,
  });

  it('merges presses within 2 s of each other into one entry, dated at the first', () => {
    expect(groupWidgetTaps([tap('a', 0), tap('a', 1500), tap('a', 3000)], dayOf)).toEqual([
      { taskId: 'a', amount: 3, at: T0, localDate: '2026-10-03' },
    ]);
  });

  it('starts a new entry after a pause longer than 2 s', () => {
    expect(groupWidgetTaps([tap('a', 0), tap('a', 2500)], dayOf)).toEqual([
      { taskId: 'a', amount: 1, at: T0, localDate: '2026-10-03' },
      { taskId: 'a', amount: 1, at: T0 + 2500, localDate: '2026-10-03' },
    ]);
  });

  it('keeps tasks apart even when presses interleave, and sorts by time', () => {
    const groups = groupWidgetTaps(
      [tap('b', 1000, 5), tap('a', 0), tap('a', 1200), tap('b', 1800, 5)],
      dayOf,
    );
    expect(groups).toEqual([
      { taskId: 'a', amount: 2, at: T0, localDate: '2026-10-03' },
      { taskId: 'b', amount: 10, at: T0 + 1000, localDate: '2026-10-03' },
    ]);
  });

  it('never merges across the day boundary', () => {
    const groups = groupWidgetTaps([tap('a', 599_500), tap('a', 600_500)], dayOf);
    expect(groups.map((g) => [g.amount, g.localDate])).toEqual([
      [1, '2026-10-03'],
      [1, '2026-10-04'],
    ]);
  });

  it('keeps time amounts as they were pressed', () => {
    expect(groupWidgetTaps([tap('plank', 0, 60), tap('plank', 900, 60)], dayOf)).toEqual([
      { taskId: 'plank', amount: 120, at: T0, localDate: '2026-10-03' },
    ]);
  });

  it('skips malformed presses', () => {
    expect(groupWidgetTaps([tap('a', 0, 0), tap('a', 100, 1.5)], dayOf)).toEqual([]);
    expect(groupWidgetTaps([], dayOf)).toEqual([]);
  });
});
