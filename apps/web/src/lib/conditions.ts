/**
 * KM Conditions confidence model (deterministic, documented in docs/CONDITIONS.md).
 *
 * For a cluster of same-kind reports within 50 m, the probability that the
 * condition is present *now* combines independent evidence in log-odds:
 *
 *   w      = reliability x 0.5^(age_hours / half_life(kind, weather))
 *   L      = logit(prior) + sum ln(1 + 99w)  (supporting: reports, confirmations)
 *                         - sum ln(1 + 99w)  (contradicting: "cleared" votes)
 *   p      = 1 / (1 + e^-L)
 *
 * A fully reliable, fresh observation multiplies the odds by 100: from the 5 %
 * prior that is p = 0.84 (a reporter at the neutral 0.5 reliability gives 0.72). Each person
 * (pseudonymous key) counts once per direction, so repeated reports by one
 * reporter cannot manufacture certainty. Official items do not decay before their
 * published end and are excluded after it. Absence of reports is never "clear".
 */
export type ConditionKind =
  | 'ice'
  | 'snow'
  | 'wet'
  | 'flooding'
  | 'construction'
  | 'obstruction'
  | 'lighting'
  | 'surface'
  | 'closure'
  | 'other';
export const KINDS: ConditionKind[] = [
  'ice',
  'snow',
  'wet',
  'flooding',
  'construction',
  'obstruction',
  'lighting',
  'surface',
  'closure',
  'other',
];
export const HALF_LIFE_H: Record<ConditionKind, number> = {
  ice: 18,
  snow: 24,
  wet: 4,
  flooding: 36,
  construction: 336,
  obstruction: 48,
  lighting: 720,
  surface: 1080,
  closure: 168,
  other: 24,
};
export const PRIOR = 0.05;
export const VOTER_RELIABILITY = 0.6;
export const CLUSTER_M = 50;
export const EVIDENCE_SCALE = 99;
const lr = (w: number) => Math.log(1 + EVIDENCE_SCALE * w);

export interface NearReport {
  id: string;
  kind: ConditionKind;
  severity: number;
  lat: number;
  lon: number;
  observed_at: string;
  ends_at: string | null;
  description: string;
  source: 'user' | 'official';
  source_name: string | null;
  own: boolean;
  reporter_reliability: number;
  reporter_key: string;
  votes: { vote: 'confirm' | 'clear' | 'flag'; at: string; voter: string }[];
}
/** Weather since the observation, from Open-Meteo at the report location. */
export interface Env {
  max_temp_c?: number | null;
  precip_mm?: number | null;
  snowfall_cm?: number | null;
}

/** Half-life adjusted by observed weather: thaw shortens ice/snow, fresh precipitation extends wetness. */
export function halfLife(kind: ConditionKind, env: Env = {}) {
  let h = HALF_LIFE_H[kind];
  const t = env.max_temp_c;
  const p = env.precip_mm ?? 0;
  if (kind === 'ice') {
    if (t != null && t > 5) h *= 0.25;
    else if ((env.snowfall_cm ?? 0) > 0.5 || (p > 2 && t != null && t < 1))
      h *= 1.5;
  }
  if (kind === 'snow' && t != null && t > 5) h *= 0.4;
  if (kind === 'wet') {
    if (p > 0.5) h *= 2;
    else if (t != null && t > 15) h *= 0.5;
  }
  if (kind === 'flooding' && p < 1) h *= 0.6;
  return h;
}

export interface Factor {
  source: 'report' | 'official' | 'confirmation' | 'cleared';
  age_h: number;
  reliability: number;
  weight: number;
  log_odds: number;
}
export interface Assessment {
  kind: ConditionKind;
  lat: number;
  lon: number;
  report_ids: string[];
  severity: number;
  probability: number;
  status: 'likely' | 'possible' | 'unlikely' | 'stale';
  conflicting: boolean;
  independent_sources: number;
  last_observed_at: string;
  description: string;
  official: string | null;
  own: boolean;
  factors: Factor[];
}

const logit = (p: number) => Math.log(p / (1 - p));
export const decay = (ageH: number, h: number) =>
  ageH <= 0 ? 1 : 0.5 ** (ageH / h);

export function assess(
  reports: NearReport[],
  now: Date,
  env: Env = {},
): Assessment | null {
  const kind = reports[0].kind;
  const h = halfLife(kind, env);
  const ms = now.getTime();
  // Strongest evidence per (person, direction): independence, not repetition.
  const best = new Map<string, Factor>();
  const put = (key: string, f: Factor) => {
    const cur = best.get(key);
    if (!cur || f.weight > cur.weight) best.set(key, f);
  };
  for (const r of reports) {
    const ageH = (ms - Date.parse(r.observed_at)) / 3600000;
    if (r.source === 'official') {
      if (r.ends_at && Date.parse(r.ends_at) < ms) continue; // published end has passed
      const w = r.reporter_reliability * (r.ends_at ? 1 : decay(ageH, h));
      put('+' + r.reporter_key + r.id, {
        source: 'official',
        age_h: ageH,
        reliability: r.reporter_reliability,
        weight: w,
        log_odds: lr(w),
      });
    } else {
      const w = r.reporter_reliability * decay(ageH, h);
      put('+' + r.reporter_key, {
        source: 'report',
        age_h: ageH,
        reliability: r.reporter_reliability,
        weight: w,
        log_odds: lr(w),
      });
    }
    for (const v of r.votes) {
      if (v.vote === 'flag') continue; // moderation signal, not evidence about the ground
      const vAge = (ms - Date.parse(v.at)) / 3600000;
      const w = VOTER_RELIABILITY * decay(vAge, h);
      if (v.vote === 'confirm')
        put('+' + v.voter, {
          source: 'confirmation',
          age_h: vAge,
          reliability: VOTER_RELIABILITY,
          weight: w,
          log_odds: lr(w),
        });
      else
        put('-' + v.voter, {
          source: 'cleared',
          age_h: vAge,
          reliability: VOTER_RELIABILITY,
          weight: w,
          log_odds: -lr(w),
        });
    }
  }
  const factors = [...best.values()].sort((a, b) => a.age_h - b.age_h);
  if (!factors.some((f) => f.log_odds > 0)) return null;
  const L = logit(PRIOR) + factors.reduce((s, f) => s + f.log_odds, 0);
  const p = 1 / (1 + Math.exp(-L));
  const pos = factors
    .filter((f) => f.log_odds > 0)
    .reduce((s, f) => s + f.weight, 0);
  const neg = factors
    .filter((f) => f.log_odds < 0)
    .reduce((s, f) => s + f.weight, 0);
  const fresh = factors.some((f) => f.weight >= 0.1);
  const latest = [...reports].sort(
    (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at),
  )[0];
  const official = reports.find((r) => r.source === 'official');
  return {
    kind,
    lat: latest.lat,
    lon: latest.lon,
    report_ids: reports.map((r) => r.id),
    severity: Math.max(...reports.map((r) => r.severity)),
    probability: Math.round(p * 1000) / 1000,
    status: !fresh
      ? 'stale'
      : p >= 0.7
        ? 'likely'
        : p >= 0.35
          ? 'possible'
          : 'unlikely',
    conflicting: pos >= 0.3 && neg >= 0.3,
    independent_sources: new Set(
      [...best.keys()].filter((k) => k.startsWith('+')),
    ).size,
    last_observed_at: latest.observed_at,
    description: latest.description,
    official: official?.source_name ?? null,
    own: reports.some((r) => r.own),
    factors: factors.map((f) => ({
      ...f,
      age_h: Math.round(f.age_h * 10) / 10,
      weight: Math.round(f.weight * 1000) / 1000,
      log_odds: Math.round(f.log_odds * 1000) / 1000,
    })),
  };
}

const R = 6371008.8;
function metres(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const x =
    (((b.lon - a.lon) * Math.PI) / 180) *
    Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const y = ((b.lat - a.lat) * Math.PI) / 180;
  return Math.hypot(x, y) * R;
}
/** Greedy clustering: same kind, within CLUSTER_M of the cluster's newest report. */
export function cluster(reports: NearReport[]) {
  const sorted = [...reports].sort(
    (a, b) =>
      Date.parse(b.observed_at) - Date.parse(a.observed_at) ||
      a.id.localeCompare(b.id),
  );
  const groups: NearReport[][] = [];
  for (const r of sorted) {
    const g = groups.find(
      (c) => c[0].kind === r.kind && metres(c[0], r) <= CLUSTER_M,
    );
    if (g) g.push(r);
    else groups.push([r]);
  }
  return groups;
}
export function assessAll(
  reports: NearReport[],
  now: Date,
  env: (r: NearReport) => Env = () => ({}),
) {
  return cluster(reports)
    .map((g) => assess(g, now, env(g[0])))
    .filter((a): a is Assessment => a !== null)
    .sort((a, b) => b.probability - a.probability);
}
/** Router penalty in [0,1]: only current (likely/possible) conditions shape routes. */
export const hazardWeight = (a: Assessment) =>
  a.status === 'likely' || a.status === 'possible'
    ? Math.round(a.probability * (a.severity / 3) * 1000) / 1000
    : 0;
