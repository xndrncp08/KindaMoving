/**
 * Training paces from the athlete's own best efforts (no population defaults
 * unless there is no history). Race-time equivalence uses Riegel (1981):
 * T2 = T1 x (D2/D1)^1.06, applied only from efforts >= 3 km (shorter efforts
 * overpredict longer races). Zones are fractions of 10 km-equivalent pace; these
 * are heuristic coaching ranges, labelled as estimates.
 */
export const RACE_M = {
  '5k': 5000,
  '10k': 10000,
  half: 21097.5,
  marathon: 42195,
} as const;
export type Race = keyof typeof RACE_M;

export function riegel(timeS: number, fromM: number, toM: number) {
  return timeS * (toM / fromM) ** 1.06;
}
/** Best 10k-equivalent time across efforts of >= 3 km. */
export function tenKEquivalent(
  efforts: { distance_m: number; elapsed_s: number }[],
) {
  const usable = efforts.filter((e) => e.distance_m >= 3000 && e.elapsed_s > 0);
  if (!usable.length) return null;
  return Math.min(
    ...usable.map((e) => riegel(e.elapsed_s, e.distance_m, 10000)),
  );
}
const ZONES = {
  recovery: [1.3, 1.4],
  easy: [1.18, 1.3],
  steady: [1.1, 1.17],
  marathon: [1.06, 1.1],
  threshold: [1.01, 1.04],
  interval: [0.95, 0.98],
  repetition: [0.9, 0.94],
} as const;
export type Zone = keyof typeof ZONES;
export interface Paces {
  basis: string;
  ten_k_s: number;
  zones: Record<Zone, [number, number]>;
  predictions: Record<Race, number>;
}
/** `fallbackTenK` (e.g. from experience level) is used only when there are no qualifying efforts. */
export function paces(
  efforts: { distance_m: number; elapsed_s: number }[],
  fallbackTenK = 3600,
): Paces {
  const measured = tenKEquivalent(efforts);
  const tenK = measured ?? fallbackTenK;
  const per = tenK / 10;
  const zones = Object.fromEntries(
    Object.entries(ZONES).map(([k, [lo, hi]]) => [
      k,
      [Math.round(per * lo), Math.round(per * hi)],
    ]),
  ) as Record<Zone, [number, number]>;
  return {
    basis: measured
      ? 'your best recorded efforts (Riegel equivalence)'
      : 'a default for your experience level; record a run of 3 km or more to personalise',
    ten_k_s: Math.round(tenK),
    zones,
    predictions: Object.fromEntries(
      Object.entries(RACE_M).map(([k, m]) => [
        k,
        Math.round(riegel(tenK, 10000, m)),
      ]),
    ) as Record<Race, number>,
  };
}
