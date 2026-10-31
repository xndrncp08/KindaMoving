import { describe, it, expect } from 'vitest';
import {
  consistency,
  edwardsTrimp,
  loadTrend,
  overview,
  personalBests,
  weekOf,
  weeklySeries,
  type HistoryRow,
} from '@/lib/analytics';
import { pickHour } from '@/lib/server/weather';
const row = (
  id: string,
  date: string,
  extra: Partial<HistoryRow> = {},
): HistoryRow => ({
  id,
  title: 'Run ' + id,
  sport: 'running',
  started_at: date,
  start_time: date + 'T13:00:00Z',
  distance_m: 10000,
  moving_s: 3000,
  elapsed_s: 3100,
  max_hr: null,
  best_efforts: null,
  hr_histogram: null,
  ...extra,
});
describe('history analytics', () => {
  it('finds personal bests per distance, earliest on ties, runs only', () => {
    const pbs = personalBests([
      row('a', '2026-09-01', {
        best_efforts: { '5k': { elapsed_s: 1300 }, '1k': { elapsed_s: 240 } },
      }),
      row('b', '2026-09-10', {
        best_efforts: { '5k': { elapsed_s: 1250 }, '1k': { elapsed_s: 240 } },
      }),
      row('c', '2026-09-12', {
        sport: 'cycling',
        best_efforts: { '5k': { elapsed_s: 500 } },
      }),
    ]);
    expect(pbs).toEqual([
      expect.objectContaining({ effort: '1k', activity_id: 'a' }),
      expect.objectContaining({
        effort: '5k',
        activity_id: 'b',
        elapsed_s: 1250,
      }),
    ]);
  });
  it('assigns weeks Monday-first across month and DST boundaries', () => {
    expect(weekOf('2026-11-01')).toBe('2026-10-26'); // Sunday after the DST change
    expect(weekOf('2026-11-02')).toBe('2026-11-02');
    expect(weekOf('2026-03-01')).toBe('2026-02-23');
  });
  it('computes Edwards TRIMP by zone', () => {
    // 10 min at ~152 bpm (80-90 % of 180 -> zone 4) + 5 min at ~127 bpm (70-80 % -> zone 3)
    expect(edwardsTrimp({ '150': 600, '125': 300 }, 180)).toBe(55);
    expect(edwardsTrimp(null, 180)).toBeNull();
    expect(edwardsTrimp({ '150': 600 }, null)).toBeNull();
  });
  it('builds weekly series, load trend and consistency deterministically', () => {
    const rows = [
      row('a', '2026-10-27'),
      row('b', '2026-10-29'),
      row('c', '2026-10-20'),
      row('d', '2026-09-01'),
    ];
    const series = weeklySeries(rows, null, '2026-10-31', 4);
    expect(series.map((w) => w.runs)).toEqual([0, 0, 1, 2]);
    expect(series[3].distance_m).toBe(20000);
    const load = loadTrend(rows, '2026-10-31');
    expect(load.last7_s).toBe(6000);
    expect(load.weekly_avg28_s).toBe(2250);
    expect(consistency(series)).toMatchObject({
      active_weeks: 2,
      current_streak_weeks: 2,
    });
    expect(overview(rows, '2026-10-31')).toEqual(
      overview([...rows].reverse(), '2026-10-31'),
    );
  });
  it('picks the weather hour containing the start', () => {
    const body = {
      hourly: {
        time: ['2026-10-01T12:00', '2026-10-01T13:00'],
        temperature_2m: [8, 9.5],
        wind_speed_10m: [5, null],
      },
    };
    const w = pickHour(body, new Date('2026-10-01T13:42:00Z'));
    expect(w).toMatchObject({
      temperature_c: 9.5,
      wind_kmh: null,
      hour_utc: '2026-10-01T13:00',
    });
    expect(pickHour(body, new Date('2026-10-02T13:00:00Z'))).toBeNull();
  });
});
