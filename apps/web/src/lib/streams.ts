import type { ActivityStreams } from '@km/types';
export interface ChartPoint {
  km: number;
  pace: number | null; // s/km over the trailing window
  hr: number | null;
  ele: number | null;
}
/**
 * Chart series from processed streams. Pace is distance-over-time across a
 * trailing 30 s window of *moving* samples (instantaneous GPS pace is too noisy),
 * then thinned to at most ``maxPoints`` by even stride for render cost.
 */
export function chartSeries(
  s: ActivityStreams,
  maxPoints = 600,
  windowS = 30,
): ChartPoint[] {
  const n = s.t.length;
  if (n < 2) return [];
  const step = Math.max(1, Math.ceil(n / maxPoints));
  const out: ChartPoint[] = [];
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (s.t[i] - s.t[lo] > windowS) lo++;
    if (i % step !== 0 && i !== n - 1) continue;
    const d = s.dist[i] - s.dist[lo];
    const dt = s.t[i] - s.t[lo];
    const pace = s.moving[i] && d > 5 && dt > 0 ? dt / (d / 1000) : null;
    out.push({
      km: Math.round(s.dist[i]) / 1000,
      pace: pace !== null && pace < 1800 ? Math.round(pace) : null,
      hr: s.hr[i],
      ele: s.ele[i],
    });
  }
  return out;
}
