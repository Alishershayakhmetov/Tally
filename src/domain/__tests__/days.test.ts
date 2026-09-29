import { DatabaseSync } from 'node:sqlite';

import { addDays, effectiveDayStart, LOGICAL_DATE_SQL, logicalDate } from '../days';

function at(wallClock: string, utcOffsetMin: number): number {
  const sign = utcOffsetMin < 0 ? '-' : '+';
  const abs = Math.abs(utcOffsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return Date.parse(`${wallClock}:00${offset}`);
}

describe('logicalDate', () => {
  const ALMATY = 300;

  it.each([
    ['2026-09-29T01:30', ALMATY, 240, '2026-09-28'],
    ['2026-09-29T03:59', ALMATY, 240, '2026-09-28'],
    ['2026-09-29T04:00', ALMATY, 240, '2026-09-29'],
    ['2026-09-29T01:30', ALMATY, 0, '2026-09-29'],
    ['2026-09-29T00:00', ALMATY, 0, '2026-09-29'],
    ['2026-09-29T23:59', ALMATY, 720, '2026-09-29'],
    ['2026-09-30T11:59', ALMATY, 720, '2026-09-29'],
    ['2026-10-03T02:00', -240, 180, '2026-10-02'],
    ['2027-01-01T00:30', ALMATY, 60, '2026-12-31'],
    ['2028-03-01T02:00', ALMATY, 180, '2028-02-29'],
    ['2026-09-29T00:10', 330, 15, '2026-09-28'],
  ])('%s at UTC%+d min with cutoff %d min is %s', (wall, offset, cutoff, expected) => {
    expect(logicalDate(at(wall, offset), offset, cutoff)).toBe(expected);
  });

  it('handles the Berlin spring-forward night with a 02:30 cutoff that never occurs', () => {
    // 2026-03-29: 01:59 CET (+60) is followed by 03:00 CEST (+120).
    expect(logicalDate(at('2026-03-29T01:59', 60), 60, 150)).toBe('2026-03-28');
    expect(logicalDate(at('2026-03-29T03:00', 120), 120, 150)).toBe('2026-03-29');
  });

  it('keeps an entry on its day when the device later changes time zone', () => {
    const occurredAt = at('2026-09-28T21:00', ALMATY);
    expect(logicalDate(occurredAt, ALMATY, 0)).toBe('2026-09-28');
  });

  it('agrees with LOGICAL_DATE_SQL on random inputs', () => {
    const db = new DatabaseSync(':memory:');
    const stmt = db.prepare(
      `SELECT ${LOGICAL_DATE_SQL} AS d FROM (SELECT :occurred_at AS occurred_at, :utc_offset_min AS utc_offset_min)`,
    );
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let i = 0; i < 5000; i++) {
      const occurredAt = Math.floor(1_600_000_000_000 + rand() * 400_000_000_000);
      const utcOffsetMin = Math.round(rand() * 26 - 12) * 60 + (rand() < 0.1 ? 30 : 0);
      const dayStartMin = Math.floor(rand() * 49) * 15;
      const row = stmt.get({
        occurred_at: occurredAt,
        utc_offset_min: utcOffsetMin,
        day_start_min: dayStartMin,
      }) as { d: string };
      expect(row.d).toBe(logicalDate(occurredAt, utcOffsetMin, dayStartMin));
    }
    db.close();
  });
});

describe('effectiveDayStart', () => {
  it('uses the task override when set, including an explicit midnight', () => {
    expect(effectiveDayStart(180, 240)).toBe(180);
    expect(effectiveDayStart(0, 240)).toBe(0);
  });

  it('falls back to the global default', () => {
    expect(effectiveDayStart(null, 240)).toBe(240);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
  ])('%s %+d → %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
