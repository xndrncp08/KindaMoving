/**
 * Deterministic training-plan generator (docs/TRAINING.md).
 *
 * Workload constraints (all enforced and tested):
 *  - weekly volume rises at most 10 % week-on-week, with a 20 % cutback every 4th week;
 *  - peak volume <= min(race/experience ceiling, 1.6 x current volume); a runner already
 *    above the ceiling maintains, never jumps;
 *  - long run <= the race's long-run cap and grows at most 2 km per week;
 *  - hard sessions (long, tempo, intervals, race) are never on consecutive days;
 *  - taper of 1-3 weeks before the race; nothing is scheduled after race day.
 * No injury-risk prediction is made or implied.
 */
import { type Paces, RACE_M, type Race } from './paces';
import { totals, type Step } from './steps';

export type Kind =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'intervals'
  | 'recovery'
  | 'race';
export const HARD: Kind[] = ['long', 'tempo', 'intervals', 'race'];
export interface PlanInput {
  race: Race;
  race_date: string;
  start_date: string;
  current_weekly_m: number;
  run_days: number[]; // 0 = Monday … 6 = Sunday
  long_run_day: number;
  experience: 'new' | 'regular' | 'experienced';
  paces: Paces;
}
export interface PlannedWorkout {
  scheduled_on: string;
  week: number;
  phase: Phase;
  kind: Kind;
  title: string;
  description: string;
  planned_distance_m: number;
  steps: Step[];
}
export type Phase = 'base' | 'build' | 'peak' | 'taper';
export class PlanError extends Error {}

const PEAK_KM: Record<Race, Record<PlanInput['experience'], number>> = {
  '5k': { new: 30, regular: 40, experienced: 55 },
  '10k': { new: 35, regular: 50, experienced: 65 },
  half: { new: 40, regular: 55, experienced: 75 },
  marathon: { new: 50, regular: 70, experienced: 95 },
};
const LONG_CAP_M: Record<Race, number> = {
  '5k': 12000,
  '10k': 16000,
  half: 21000,
  marathon: 32000,
};
const TAPER: Record<Race, number[]> = {
  '5k': [0.6],
  '10k': [0.6],
  half: [0.75, 0.5],
  marathon: [0.75, 0.6, 0.45],
};
const DAY = 86400000;
const MIN_EASY_M = 3000;
const MIN_LONG_M = 5000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const parse = (d: string) => Date.parse(d + 'T00:00:00Z');
const weekday = (d: string) => (new Date(parse(d)).getUTCDay() + 6) % 7; // Monday = 0
const r100 = (m: number) => Math.round(m / 100) * 100;

/** Weekly volume targets with progression, cutbacks and taper. */
export function volumes(
  race: Race,
  weeks: number,
  currentM: number,
  experience: PlanInput['experience'],
) {
  const taper = TAPER[race].slice(
    0,
    Math.max(1, Math.min(TAPER[race].length, weeks - 3)),
  );
  const buildWeeks = weeks - taper.length;
  const v0 = currentM > 0 ? currentM : 12000;
  const ceiling = PEAK_KM[race][experience] * 1000;
  const peak = v0 >= ceiling ? v0 : Math.min(ceiling, v0 * 1.6);
  const out: { volume_m: number; phase: Phase }[] = [];
  let level = v0;
  for (let w = 0; w < buildWeeks; w++) {
    const cutback = w % 4 === 3;
    if (w > 0 && !cutback) level = Math.min(peak, level * 1.1);
    const phase: Phase =
      w < Math.ceil(buildWeeks * 0.4)
        ? 'base'
        : buildWeeks >= 6 && w >= buildWeeks - 2
          ? 'peak'
          : 'build';
    out.push({ volume_m: r100(cutback ? level * 0.8 : level), phase });
  }
  for (const f of taper) out.push({ volume_m: r100(peak * f), phase: 'taper' });
  return { weeks: out, peak_m: r100(peak), start_m: r100(v0) };
}

/** Choose quality days maximising spacing from the long run and each other; never adjacent. */
export function qualityDays(runDays: number[], longDay: number, count: number) {
  const gap = (a: number, b: number) =>
    Math.min(Math.abs(a - b), 7 - Math.abs(a - b)); // weeks wrap
  const chosen: number[] = [];
  for (let k = 0; k < count; k++) {
    const options = runDays
      .filter((d) => d !== longDay && !chosen.includes(d))
      .filter((d) => [longDay, ...chosen].every((h) => gap(d, h) >= 2))
      .sort(
        (a, b) =>
          Math.min(...[longDay, ...chosen].map((h) => gap(b, h))) -
            Math.min(...[longDay, ...chosen].map((h) => gap(a, h))) || a - b,
      );
    if (!options.length) break;
    chosen.push(options[0]);
  }
  return chosen.sort((a, b) => a - b);
}

function easySteps(distance: number, p: Paces): Step[] {
  return [
    {
      type: 'work',
      distance_m: distance,
      intensity: 'easy',
      pace_s_per_km: p.zones.easy,
    },
  ];
}
function tempoSteps(minutes: number, p: Paces): Step[] {
  return [
    {
      type: 'warmup',
      distance_m: 2000,
      intensity: 'easy',
      pace_s_per_km: p.zones.easy,
    },
    {
      type: 'work',
      duration_s: minutes * 60,
      intensity: 'threshold',
      pace_s_per_km: p.zones.threshold,
    },
    {
      type: 'cooldown',
      distance_m: 2000,
      intensity: 'easy',
      pace_s_per_km: p.zones.easy,
    },
  ];
}
function intervalSteps(reps: number, repM: number, p: Paces): Step[] {
  return [
    {
      type: 'warmup',
      distance_m: 2000,
      intensity: 'easy',
      pace_s_per_km: p.zones.easy,
    },
    {
      type: 'repeat',
      times: reps,
      steps: [
        {
          type: 'work',
          distance_m: repM,
          intensity: 'interval',
          pace_s_per_km: p.zones.interval,
        },
        {
          type: 'recovery',
          duration_s: 120,
          intensity: 'recovery',
          pace_s_per_km: p.zones.recovery,
        },
      ],
    },
    {
      type: 'cooldown',
      distance_m: 2000,
      intensity: 'easy',
      pace_s_per_km: p.zones.easy,
    },
  ];
}
export function generatePlan(input: PlanInput): {
  workouts: PlannedWorkout[];
  weeks: { week: number; phase: Phase; volume_m: number }[];
  peak_m: number;
  start_m: number;
  warnings: string[];
} {
  const start = parse(input.start_date);
  const race = parse(input.race_date);
  if (Number.isNaN(start) || Number.isNaN(race))
    throw new PlanError('Invalid dates.');
  if (weekday(input.start_date) !== 0)
    throw new PlanError('Plans start on a Monday.');
  const weeks = Math.floor((race - start) / (7 * DAY)) + 1;
  if (weeks < 4 || weeks > 30)
    throw new PlanError('Race day must be 4 to 30 weeks after the start.');
  const days = [...new Set(input.run_days)]
    .filter((d) => d >= 0 && d <= 6)
    .sort();
  if (days.length < 3 || days.length > 6)
    throw new PlanError('Choose 3 to 6 running days.');
  if (!days.includes(input.long_run_day))
    throw new PlanError('The long-run day must be a running day.');
  const p = input.paces;
  const easyPace = (p.zones.easy[0] + p.zones.easy[1]) / 2;
  const plan = volumes(
    input.race,
    weeks,
    input.current_weekly_m,
    input.experience,
  );
  const workouts: PlannedWorkout[] = [];
  let prevLong = 0;
  plan.weeks.forEach(({ volume_m, phase }, w) => {
    const weekStart = start + w * 7 * DAY;
    const raceWeek = w === weeks - 1;
    const qualityCount =
      phase === 'taper' && raceWeek
        ? 0
        : days.length >= 5 &&
            input.experience === 'experienced' &&
            phase !== 'base'
          ? 2
          : 1;
    const qDays = qualityDays(
      days,
      input.long_run_day,
      input.experience === 'new' && phase === 'base' ? 0 : qualityCount,
    );
    let remaining = volume_m;
    const placed: PlannedWorkout[] = [];
    const add = (
      day: number,
      kind: Kind,
      distance: number,
      title: string,
      steps: Step[],
      description = '',
    ) => {
      const d = iso(weekStart + day * DAY);
      if (parse(d) > race) return;
      placed.push({
        scheduled_on: d,
        week: w + 1,
        phase,
        kind,
        title,
        description,
        planned_distance_m: r100(distance),
        steps,
      });
      remaining -= distance;
    };
    if (raceWeek) {
      const raceDay = weekday(input.race_date);
      add(raceDay, 'race', RACE_M[input.race], `Race: ${input.race}`, [
        {
          type: 'work',
          distance_m: RACE_M[input.race],
          intensity: 'interval',
          note: 'Race effort',
        },
      ]);
    } else if (volume_m < MIN_LONG_M + MIN_EASY_M) {
      // Too little volume for a long run plus anything else: only easy runs that fit the target.
      const n = Math.max(
        1,
        Math.min(days.length, Math.floor(volume_m / MIN_EASY_M)),
      );
      const order = [
        input.long_run_day,
        ...days.filter((d) => d !== input.long_run_day),
      ];
      for (const day of order.slice(0, n).sort((a, b) => a - b))
        add(day, 'easy', volume_m / n, 'Easy run', easySteps(volume_m / n, p));
    } else {
      const longCap = Math.min(
        LONG_CAP_M[input.race],
        prevLong ? prevLong + 2000 : Infinity,
        volume_m - MIN_EASY_M,
      );
      const long = Math.max(
        MIN_LONG_M,
        Math.min(longCap, volume_m * (phase === 'base' ? 0.25 : 0.3)),
      );
      prevLong = phase === 'taper' ? prevLong : long;
      add(
        input.long_run_day,
        'long',
        long,
        `Long run ${(long / 1000).toFixed(0)} km`,
        easySteps(long, p),
        'Conversational effort throughout.',
      );
      qDays.forEach((day, i) => {
        const tempo = phase === 'base' || (i === 1 && phase !== 'peak');
        const steps = tempo
          ? tempoSteps(Math.min(15 + 2 * w, phase === 'taper' ? 15 : 30), p)
          : intervalSteps(
              Math.min(4 + Math.floor(w / 2), phase === 'taper' ? 4 : 8),
              input.race === '5k' || input.race === '10k' ? 1000 : 1600,
              p,
            );
        const dist = totals(steps, easyPace).distance_m;
        if (dist > remaining) return; // a quality session that doesn't fit the week is dropped, never squeezed in
        add(
          day,
          tempo ? 'tempo' : 'intervals',
          dist,
          tempo ? 'Tempo run' : 'Intervals',
          steps,
        );
      });
    }
    const raceDay = raceWeek ? weekday(input.race_date) : 7;
    const used = new Set(placed.map((x) => weekday(x.scheduled_on)));
    const easyDays = days.filter(
      (d) =>
        !used.has(d) &&
        d !== input.long_run_day &&
        !qDays.includes(d) &&
        d < raceDay &&
        !(raceWeek && d === raceDay - 1),
    );
    // Only as many easy runs as fit at >= MIN_EASY_M each, so the week sums to its target.
    const n = Math.min(
      easyDays.length,
      Math.floor(Math.max(0, remaining) / MIN_EASY_M),
    );
    const longDist =
      placed.find((x) => x.kind === 'long')?.planned_distance_m ?? Infinity;
    const each = n ? Math.min(remaining / n, longDist - 1000) : 0;
    for (const day of easyDays.slice(0, n))
      add(
        day,
        raceWeek ? 'recovery' : 'easy',
        each,
        raceWeek ? 'Shake-out run' : 'Easy run',
        easySteps(each, p),
      );
    workouts.push(
      ...placed.sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on)),
    );
  });
  const warnings =
    plan.peak_m < 2 * RACE_M[input.race]
      ? [
          `Your logged running (${(plan.start_m / 1000).toFixed(1)} km/week) is low for a ${input.race} race, so this plan builds gradually and peaks at ${(plan.peak_m / 1000).toFixed(1)} km/week. If you run more than you log, import those runs first; consider a later race date.`,
        ]
      : [];
  return {
    workouts,
    weeks: plan.weeks.map((x, i) => ({ week: i + 1, ...x })),
    peak_m: plan.peak_m,
    start_m: plan.start_m,
    warnings,
  };
}

/** True when no two hard sessions fall on consecutive calendar days. */
export function hardDaysSpaced(list: { scheduled_on: string; kind: string }[]) {
  const hard = list
    .filter((w) => HARD.includes(w.kind as Kind))
    .map((w) => parse(w.scheduled_on))
    .sort((a, b) => a - b);
  return hard.every((t, i) => i === 0 || t - hard[i - 1] >= 2 * DAY);
}
