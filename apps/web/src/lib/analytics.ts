/**
 * Deterministic history analytics computed from activity summaries.
 * Formulas are documented in docs/ANALYTICS.md.
 */
export interface HistoryRow {
  id: string;
  title: string;
  sport: string | null;
  started_at: string; // local date
  start_time: string | null;
  distance_m: number;
  moving_s: number | null;
  elapsed_s: number;
  max_hr: number | null;
  best_efforts: Record<string, { elapsed_s: number }> | null;
  hr_histogram: Record<string, number> | null;
}
const RUN = new Set(['running', 'trail_running', 'treadmill_running']);
export const EFFORT_ORDER = [
  '400m',
  '1k',
  '1mi',
  '5k',
  '10k',
  'half',
  'marathon',
];

export function personalBests(rows: HistoryRow[]) {
  const best: Record<
    string,
    { elapsed_s: number; activity_id: string; title: string; date: string }
  > = {};
  for (const r of rows) {
    if (r.sport && !RUN.has(r.sport)) continue;
    for (const [k, v] of Object.entries(r.best_efforts ?? {})) {
      // Ties keep the earliest run: the record was set first there.
      const cur = best[k];
      if (
        !cur ||
        v.elapsed_s < cur.elapsed_s ||
        (v.elapsed_s === cur.elapsed_s && r.started_at < cur.date)
      )
        best[k] = {
          elapsed_s: v.elapsed_s,
          activity_id: r.id,
          title: r.title,
          date: r.started_at,
        };
    }
  }
  return EFFORT_ORDER.filter((k) => best[k]).map((k) => ({
    effort: k,
    ...best[k],
  }));
}

/** Monday of the local week containing an ISO date (YYYY-MM-DD), computed in UTC to avoid DST drift. */
export function weekOf(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Edwards' summated heart-rate-zone TRIMP: minutes in 50-60/60-70/70-80/80-90/90-100 %
 * of HRmax weighted 1..5. Each 5-bpm histogram band is assigned by its midpoint.
 */
export function edwardsTrimp(
  hist: Record<string, number> | null,
  hrMax: number | null,
) {
  if (!hist || !hrMax) return null;
  let total = 0;
  for (const [floor, seconds] of Object.entries(hist)) {
    const pct = (Number(floor) + 2.5) / hrMax;
    const zone =
      pct >= 0.9
        ? 5
        : pct >= 0.8
          ? 4
          : pct >= 0.7
            ? 3
            : pct >= 0.6
              ? 2
              : pct >= 0.5
                ? 1
                : 0;
    total += (zone * seconds) / 60;
  }
  return Math.round(total * 10) / 10;
}

export function weeklySeries(
  rows: HistoryRow[],
  hrMax: number | null,
  today: string,
  weeks = 16,
) {
  const current = weekOf(today);
  const series = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(current + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 7 * (weeks - 1 - i));
    return {
      week: d.toISOString().slice(0, 10),
      distance_m: 0,
      moving_s: 0,
      runs: 0,
      trimp: 0,
      hr_runs: 0,
    };
  });
  const index = new Map(series.map((w, i) => [w.week, i]));
  for (const r of rows) {
    const i = index.get(weekOf(r.started_at));
    if (i === undefined) continue;
    const w = series[i];
    w.distance_m += r.distance_m;
    w.moving_s += r.moving_s ?? r.elapsed_s;
    w.runs += 1;
    const t = edwardsTrimp(r.hr_histogram, hrMax);
    if (t !== null) {
      w.trimp += t;
      w.hr_runs += 1;
    }
  }
  return series;
}

/**
 * Descriptive load trend: last-7-day moving time against the 28-day weekly average.
 * Presented as a trend only; it is not an injury-risk prediction.
 */
export function loadTrend(rows: HistoryRow[], today: string) {
  const t = Date.parse(today + 'T23:59:59Z');
  const within = (days: number) =>
    rows.filter((r) => {
      const d = Date.parse(r.started_at + 'T12:00:00Z');
      return d <= t && d > t - days * 86400000;
    });
  const sum = (rs: HistoryRow[]) =>
    rs.reduce((s, r) => s + (r.moving_s ?? r.elapsed_s), 0);
  const acute = sum(within(7));
  const chronicWeekly = sum(within(28)) / 4;
  return {
    last7_s: acute,
    weekly_avg28_s: Math.round(chronicWeekly),
    ratio:
      chronicWeekly > 0
        ? Math.round((acute / chronicWeekly) * 100) / 100
        : null,
  };
}

export function consistency(series: { runs: number }[]) {
  const recent = series.slice(-12);
  const active = recent.filter((w) => w.runs > 0).length;
  let streak = 0;
  for (let i = series.length - 1; i >= 0 && series[i].runs > 0; i--) streak++;
  return {
    active_weeks: active,
    of_weeks: recent.length,
    runs_per_week:
      Math.round(
        (recent.reduce((s, w) => s + w.runs, 0) / Math.max(recent.length, 1)) *
          10,
      ) / 10,
    current_streak_weeks: streak,
  };
}

export function overview(rows: HistoryRow[], today: string) {
  const hrValues = rows.map((r) => r.max_hr ?? 0).filter((v) => v > 0);
  const hrMax = hrValues.length ? Math.max(...hrValues) : null;
  const weekly = weeklySeries(rows, hrMax, today);
  return {
    personal_bests: personalBests(rows),
    weekly,
    load: loadTrend(rows, today),
    consistency: consistency(weekly),
    hr_max_estimate: hrMax,
  };
}
export type Overview = ReturnType<typeof overview>;
