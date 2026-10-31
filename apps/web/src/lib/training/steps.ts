import { z } from 'zod';
/**
 * Structured workout steps. A step is measured by distance or duration and may
 * carry a target pace range (s/km) or heart-rate range. `repeat` blocks hold
 * child steps (one level deep, which covers intervals like 6 x (800 m + 400 m)).
 */
export const intensity = z.enum([
  'easy',
  'steady',
  'marathon',
  'threshold',
  'interval',
  'repetition',
  'recovery',
]);
const base = z.object({
  type: z.enum(['warmup', 'work', 'recovery', 'cooldown']),
  distance_m: z.number().positive().max(100000).optional(),
  duration_s: z.number().positive().max(36000).optional(),
  intensity,
  pace_s_per_km: z
    .tuple([z.number().min(120).max(1200), z.number().min(120).max(1200)])
    .optional(),
  hr: z
    .tuple([z.number().min(60).max(230), z.number().min(60).max(230)])
    .optional(),
  note: z.string().max(200).optional(),
});
export const simpleStep = base.refine(
  (s) => !!s.distance_m !== !!s.duration_s,
  'A step needs a distance or a duration, not both.',
);
export const step = z.union([
  simpleStep,
  z.object({
    type: z.literal('repeat'),
    times: z.number().int().min(2).max(50),
    steps: z.array(simpleStep).min(1).max(10),
  }),
]);
export const steps = z.array(step).max(40);
export type SimpleStep = z.infer<typeof simpleStep>;
export type Step = z.infer<typeof step>;

export function flatten(list: Step[]): SimpleStep[] {
  return list.flatMap((s) =>
    'times' in s ? Array.from({ length: s.times }, () => s.steps).flat() : [s],
  );
}
const midPace = (s: SimpleStep, fallback: number) =>
  s.pace_s_per_km ? (s.pace_s_per_km[0] + s.pace_s_per_km[1]) / 2 : fallback;
/** Planned distance and duration; steps measured one way are converted with their target pace. */
export function totals(list: Step[], easyPace = 360) {
  let distance = 0;
  let duration = 0;
  for (const s of flatten(list)) {
    const pace = midPace(s, easyPace);
    if (s.distance_m) {
      distance += s.distance_m;
      duration += (s.distance_m / 1000) * pace;
    } else if (s.duration_s) {
      duration += s.duration_s;
      distance += (s.duration_s / pace) * 1000;
    }
  }
  return { distance_m: Math.round(distance), duration_s: Math.round(duration) };
}
const fmtPace = (p: number) =>
  `${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')}`;
export function describe(s: Step): string {
  if ('times' in s)
    return `${s.times} × (${s.steps.map(describe).join(' + ')})`;
  const amount = s.distance_m
    ? s.distance_m >= 1000
      ? `${(s.distance_m / 1000).toFixed(1)} km`
      : `${s.distance_m} m`
    : `${Math.round(s.duration_s! / 60)} min`;
  const target = s.pace_s_per_km
    ? ` @ ${fmtPace(s.pace_s_per_km[0])}–${fmtPace(s.pace_s_per_km[1])}/km`
    : s.hr
      ? ` @ ${s.hr[0]}–${s.hr[1]} bpm`
      : '';
  return `${amount} ${s.intensity}${target}`;
}
