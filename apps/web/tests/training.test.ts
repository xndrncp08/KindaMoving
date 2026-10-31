import { describe, it, expect } from 'vitest';
import {
  generatePlan,
  hardDaysSpaced,
  PlanError,
  qualityDays,
  volumes,
  type PlanInput,
} from '@/lib/training/plan';
import { paces, riegel, tenKEquivalent } from '@/lib/training/paces';
import {
  alternatives,
  reconcile,
  type PlanWorkout,
} from '@/lib/training/reconcile';
import {
  describe as describeStep,
  steps as stepsSchema,
  totals,
} from '@/lib/training/steps';

const p = paces([{ distance_m: 5000, elapsed_s: 1500 }]);
const base: PlanInput = {
  race: 'half',
  race_date: '2027-02-28', // Sunday
  start_date: '2026-11-02', // Monday
  current_weekly_m: 30000,
  run_days: [1, 3, 5, 6],
  long_run_day: 6,
  experience: 'regular',
  paces: p,
};

describe('paces', () => {
  it('uses Riegel from efforts >= 3 km only', () => {
    expect(riegel(1500, 5000, 10000)).toBeCloseTo(3127.4, 0);
    expect(tenKEquivalent([{ distance_m: 1000, elapsed_s: 200 }])).toBeNull();
    expect(p.basis).toContain('your best recorded efforts');
    expect(p.zones.easy[0]).toBeGreaterThan(p.zones.threshold[1]);
    expect(p.predictions.half).toBeGreaterThan(p.predictions['10k'] * 2);
    expect(paces([]).basis).toContain('default');
  });
});
describe('steps', () => {
  it('validates, totals and describes structured workouts', () => {
    const s = stepsSchema.parse([
      {
        type: 'warmup',
        distance_m: 2000,
        intensity: 'easy',
        pace_s_per_km: [360, 380],
      },
      {
        type: 'repeat',
        times: 6,
        steps: [
          {
            type: 'work',
            distance_m: 800,
            intensity: 'interval',
            pace_s_per_km: [240, 250],
          },
          {
            type: 'recovery',
            duration_s: 120,
            intensity: 'recovery',
            pace_s_per_km: [420, 440],
          },
        ],
      },
    ]);
    expect(totals(s).distance_m).toBe(
      2000 + 4800 + Math.round(6 * (120 / 430) * 1000),
    );
    expect(describeStep(s[1])).toBe(
      '6 × (800 m interval @ 4:00–4:10/km + 2 min recovery @ 7:00–7:20/km)',
    );
    expect(
      stepsSchema.safeParse([
        { type: 'work', distance_m: 1000, duration_s: 60, intensity: 'easy' },
      ]).success,
    ).toBe(false);
  });
});
describe('plan generation constraints', () => {
  const plan = generatePlan(base);
  it('progresses at most 10% per week with cutbacks and a capped peak', () => {
    const weeks = volumes('half', 17, 30000, 'regular').weeks;
    const build = weeks
      .filter((w) => w.phase !== 'taper')
      .map((w) => w.volume_m);
    let last = build[0];
    for (let i = 1; i < build.length; i++) {
      if (i % 4 === 3) {
        expect(build[i]).toBeLessThan(build[i - 1]); // every 4th week is a cutback
        continue;
      }
      expect(build[i]).toBeLessThanOrEqual(last * 1.1 + 100); // +100 m rounding
      expect(build[i]).toBeGreaterThanOrEqual(last); // and never regresses outside cutbacks
      last = build[i];
    }
    const v = weeks.map((w) => w.volume_m);
    expect(Math.max(...v)).toBeLessThanOrEqual(30000 * 1.6);
    expect(volumes('half', 10, 90000, 'regular').peak_m).toBe(90000); // already above the ceiling: maintain, never jump
  });
  it('keeps hard days apart, puts the race on race day and nothing after', () => {
    expect(hardDaysSpaced(plan.workouts)).toBe(true);
    const race = plan.workouts.filter((w) => w.kind === 'race');
    expect(race).toHaveLength(1);
    expect(race[0].scheduled_on).toBe('2027-02-28');
    expect(plan.workouts.every((w) => w.scheduled_on <= '2027-02-28')).toBe(
      true,
    );
  });
  it('caps and gradually grows the long run, and tapers', () => {
    const longs = plan.workouts
      .filter((w) => w.kind === 'long')
      .map((w) => w.planned_distance_m);
    expect(Math.max(...longs)).toBeLessThanOrEqual(21000);
    const build = plan.weeks.filter((w) => w.phase !== 'taper');
    const taper = plan.weeks.filter((w) => w.phase === 'taper');
    expect(taper).toHaveLength(2);
    expect(taper[0].volume_m).toBeLessThan(
      Math.max(...build.map((w) => w.volume_m)),
    );
  });
  it('is deterministic and rejects impossible inputs', () => {
    expect(generatePlan(base)).toEqual(generatePlan(base));
    expect(() => generatePlan({ ...base, start_date: '2026-11-03' })).toThrow(
      PlanError,
    );
    expect(() => generatePlan({ ...base, race_date: '2026-11-20' })).toThrow(
      PlanError,
    );
    expect(() => generatePlan({ ...base, run_days: [1, 2] })).toThrow(
      PlanError,
    );
    expect(() => generatePlan({ ...base, long_run_day: 0 })).toThrow(PlanError);
  });
  it('never schedules adjacent quality days, even across the week boundary', () => {
    expect(qualityDays([0, 1, 2, 6], 6, 2)).toEqual([2]); // Mon/Tue would touch Sunday's long run
    expect(qualityDays([0, 1, 2, 3, 4, 5], 5, 2)).toEqual([1, 3]);
    for (const days of [
      [0, 2, 4, 6],
      [1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
    ])
      expect(
        hardDaysSpaced(
          generatePlan({
            ...base,
            run_days: days,
            long_run_day: days.at(-1)!,
            experience: 'experienced',
          }).workouts,
        ),
      ).toBe(true);
  });
});
describe('reconciliation', () => {
  const w = (id: string, on: string, kind: string, d = 8000): PlanWorkout => ({
    id,
    scheduled_on: on,
    kind,
    status: 'planned',
    planned_distance_m: d,
    activity_id: null,
  });
  it('links runs by date and grades compliance', () => {
    const c = reconcile(
      [w('a', '2026-11-03', 'easy'), w('b', '2026-11-04', 'tempo')],
      [
        { id: 'r1', started_at: '2026-11-03', distance_m: 7000 },
        { id: 'r2', started_at: '2026-11-04', distance_m: 4500 },
      ],
      '2026-11-05',
    );
    expect(c).toContainEqual(
      expect.objectContaining({
        type: 'link',
        workout_id: 'a',
        compliance: 'completed',
      }),
    );
    expect(c).toContainEqual(
      expect.objectContaining({
        type: 'link',
        workout_id: 'b',
        compliance: 'partial',
      }),
    );
  });
  it('skips missed easy runs and never stacks volume', () => {
    const c = reconcile(
      [w('a', '2026-11-03', 'easy'), w('b', '2026-11-05', 'easy')],
      [],
      '2026-11-04',
    );
    expect(c).toEqual([
      { type: 'missed', workout_id: 'a' },
      {
        type: 'skip',
        workout_id: 'a',
        reason: 'Missed easy runs are not made up.',
      },
    ]);
  });
  it('moves a recently missed hard session onto an easy day only when spacing allows', () => {
    const plan = [
      w('tempo', '2026-11-03', 'tempo'),
      w('e1', '2026-11-04', 'easy'),
      w('e2', '2026-11-05', 'easy'),
      w('long', '2026-11-07', 'long', 16000),
    ];
    const c = reconcile(plan, [], '2026-11-04');
    expect(c).toContainEqual(
      expect.objectContaining({
        type: 'move',
        workout_id: 'tempo',
        to: '2026-11-04',
      }),
    );
    expect(c).toContainEqual(
      expect.objectContaining({ type: 'skip', workout_id: 'e1' }),
    );
    const blocked = reconcile(
      [
        w('tempo', '2026-11-03', 'tempo'),
        w('e1', '2026-11-04', 'easy'),
        w('long', '2026-11-05', 'long', 16000),
      ],
      [],
      '2026-11-04',
    );
    expect(blocked).toContainEqual(
      expect.objectContaining({ type: 'skip', workout_id: 'tempo' }),
    );
    expect(
      reconcile(
        [w('tempo', '2026-10-28', 'tempo'), w('e1', '2026-11-04', 'easy')],
        [],
        '2026-11-04',
      ),
    ).toContainEqual(
      expect.objectContaining({
        type: 'skip',
        reason: 'Missed more than 2 days ago.',
      }),
    );
  });
  it('suggests clear routes and indoor options when conditions block a session', () => {
    const alt = alternatives({ kind: 'tempo', planned_distance_m: 10000 }, [
      { id: 'a', title: 'River', distance_m: 9800, status: 'caution' },
      {
        id: 'b',
        title: 'Park',
        distance_m: 10500,
        status: 'no_current_reports',
      },
      {
        id: 'c',
        title: 'Short',
        distance_m: 5000,
        status: 'no_current_reports',
      },
    ]);
    expect(alt.map((a) => a.type)).toEqual(['route', 'indoor', 'swap']);
    expect(alt[0].route_id).toBe('b');
  });
});
import { validate } from '@/lib/coros/schema';
import { toCourse } from '@/lib/coros/workout';
describe('COROS workout schema gate', () => {
  const course = toCourse({
    title: 'Tempo',
    description: '',
    steps: [
      {
        type: 'work',
        distance_m: 5000,
        intensity: 'threshold',
        pace_s_per_km: [250, 260],
      },
    ],
  });
  it('accepts a payload that matches the live schema', () => {
    const schema = {
      type: 'object',
      required: ['course', 'date'],
      properties: {
        date: { type: 'string' },
        course: {
          type: 'object',
          required: ['name', 'sportType'],
          properties: { sportType: { type: 'integer', enum: [1, 2, 5] } },
        },
      },
    };
    expect(validate({ course, date: '20261105' }, schema)).toEqual([]);
  });
  it('names every mismatch instead of sending', () => {
    const schema = {
      type: 'object',
      required: ['course'],
      properties: {
        course: {
          type: 'object',
          required: ['name', 'exerciseList'],
          properties: { sportType: { type: 'string' } },
        },
      },
    };
    expect(validate({ course }, schema)).toEqual([
      '$.course.exerciseList: required',
      '$.course.sportType: expected string, got integer',
    ]);
  });
});

describe('weekly sessions fit the volume target (found in live verification)', () => {
  const weekTotals = (plan: ReturnType<typeof generatePlan>) =>
    plan.weeks.map((w) => ({
      target: w.volume_m,
      planned: plan.workouts
        .filter((x) => x.week === w.week && x.kind !== 'race')
        .reduce((s, x) => s + x.planned_distance_m, 0),
      last: w.week === plan.weeks.length,
    }));
  it('never plans more than the target for a low-volume runner', () => {
    const low = generatePlan({
      ...base,
      race: '10k',
      race_date: '2027-01-24',
      current_weekly_m: 3300,
    });
    for (const w of weekTotals(low))
      expect(w.planned).toBeLessThanOrEqual(w.target + 500);
    expect(low.warnings[0]).toContain('low for a 10k race');
    expect(
      low.workouts.some((x) => x.kind === 'tempo' || x.kind === 'intervals'),
    ).toBe(false);
  });
  it('fills normal weeks close to the target', () => {
    for (const w of weekTotals(generatePlan(base)).filter((x) => !x.last)) {
      expect(w.planned).toBeLessThanOrEqual(w.target + 500);
      expect(w.planned).toBeGreaterThanOrEqual(w.target * 0.85);
    }
    expect(generatePlan(base).warnings).toEqual([]);
  });
});
