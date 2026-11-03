import { describe, expect, it } from 'vitest';
import { day, today, weekOf } from '@/lib/metrics';

describe('calendar helpers shared by server and client rendering', () => {
  it('builds the Monday-to-Sunday week containing a date', () => {
    expect(weekOf('2026-11-02')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(weekOf('2026-11-01')[0]).toBe('2026-10-26'); // Sunday belongs to the prior week
    expect(weekOf('2026-01-01')[0]).toBe('2025-12-29'); // across a year boundary
  });
  it('formats calendar dates identically in every zone', () => {
    const opts = { weekday: 'short', month: 'short', day: 'numeric' } as const;
    expect(day('2026-10-30', opts, 'en-US')).toBe('Fri, Oct 30');
    expect(day('2026-10-30', opts, 'en-CA')).toMatch(/Fri.*Oct.*30/);
  });
  it('reads today in an explicit zone', () => {
    expect(today('America/Edmonton')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const utc = today('UTC');
    const kiritimati = today('Pacific/Kiritimati'); // UTC+14 is never behind UTC
    expect(kiritimati >= utc).toBe(true);
  });
});
