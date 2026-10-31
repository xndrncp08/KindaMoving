/**
 * Plan <-> activity reconciliation and missed-workout handling (docs/TRAINING.md).
 *
 * Compliance: a planned workout on or before today is matched to an unlinked run
 * on the same local date (closest distance). Ratio >= 0.8 is "completed",
 * 0.5-0.8 "partial"; anything else stays unmatched.
 * Missed sessions (date before today, no match):
 *  - easy/recovery: skipped. Missed volume is never made up.
 *  - long/tempo/intervals missed within the last 2 days: moved onto the first easy-run
 *    date in the next 3 days where it keeps every hard session >= 2 days apart; that
 *    easy run is skipped (sessions are swapped, never stacked). Otherwise skipped.
 * These are proposals; nothing is written until the athlete applies them.
 */
import { HARD, hardDaysSpaced, type Kind } from './plan';

export interface PlanWorkout {
  id: string;
  scheduled_on: string;
  kind: Kind | string;
  status: 'planned' | 'completed' | 'missed' | 'skipped';
  planned_distance_m: number | null;
  activity_id: string | null;
}
export interface Run {
  id: string;
  started_at: string; // local date
  distance_m: number;
  sport?: string | null;
}
export type Change =
  | {
      type: 'link';
      workout_id: string;
      activity_id: string;
      compliance: 'completed' | 'partial';
      ratio: number;
    }
  | { type: 'missed'; workout_id: string }
  | { type: 'skip'; workout_id: string; reason: string }
  | { type: 'move'; workout_id: string; to: string; reason: string };

const DAY = 86400000;
const parse = (d: string) => Date.parse(d + 'T00:00:00Z');
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const RUN = new Set([
  'running',
  'trail_running',
  'treadmill_running',
  null,
  undefined,
]);

export function reconcile(
  workouts: PlanWorkout[],
  runs: Run[],
  today: string,
): Change[] {
  const changes: Change[] = [];
  const used = new Set(
    workouts.map((w) => w.activity_id).filter(Boolean) as string[],
  );
  const t = parse(today);
  const sorted = [...workouts].sort(
    (a, b) =>
      a.scheduled_on.localeCompare(b.scheduled_on) || a.id.localeCompare(b.id),
  );
  const state = new Map(sorted.map((w) => [w.id, { ...w }]));
  for (const w of sorted) {
    if (w.status !== 'planned' || parse(w.scheduled_on) > t || w.activity_id)
      continue;
    const planned = w.planned_distance_m ?? 0;
    const match = runs
      .filter(
        (r) =>
          r.started_at === w.scheduled_on &&
          !used.has(r.id) &&
          RUN.has(r.sport),
      )
      .sort(
        (a, b) =>
          Math.abs(a.distance_m - planned) - Math.abs(b.distance_m - planned) ||
          a.id.localeCompare(b.id),
      )[0];
    const ratio =
      match && planned > 0 ? match.distance_m / planned : match ? 1 : 0;
    if (match && ratio >= 0.5) {
      used.add(match.id);
      changes.push({
        type: 'link',
        workout_id: w.id,
        activity_id: match.id,
        compliance: ratio >= 0.8 ? 'completed' : 'partial',
        ratio: Math.round(ratio * 100) / 100,
      });
      state.get(w.id)!.status = 'completed';
      continue;
    }
    if (parse(w.scheduled_on) >= t) continue; // today is not over yet
    changes.push({ type: 'missed', workout_id: w.id });
    state.get(w.id)!.status = 'missed';
    if (!HARD.includes(w.kind as Kind) || t - parse(w.scheduled_on) > 2 * DAY) {
      changes.push({
        type: 'skip',
        workout_id: w.id,
        reason: HARD.includes(w.kind as Kind)
          ? 'Missed more than 2 days ago.'
          : 'Missed easy runs are not made up.',
      });
      continue;
    }
    let moved = false;
    for (let k = 0; k <= 3 && !moved; k++) {
      const day = iso(t + k * DAY);
      const easy = [...state.values()].find(
        (x) =>
          x.scheduled_on === day &&
          x.status === 'planned' &&
          (x.kind === 'easy' || x.kind === 'recovery'),
      );
      if (!easy) continue;
      const trial = [...state.values()]
        .filter(
          (x) =>
            x.id !== easy.id &&
            x.id !== w.id &&
            x.status !== 'skipped' &&
            x.status !== 'missed',
        )
        .concat([{ ...w, scheduled_on: day }]);
      if (!hardDaysSpaced(trial)) continue;
      changes.push({
        type: 'move',
        workout_id: w.id,
        to: day,
        reason: `Swapped with the easy run on ${day}; hard days stay at least 2 days apart.`,
      });
      changes.push({
        type: 'skip',
        workout_id: easy.id,
        reason: `Replaced by the rescheduled ${w.kind} session.`,
      });
      state.get(easy.id)!.status = 'skipped';
      state.get(w.id)!.scheduled_on = day;
      state.get(w.id)!.status = 'planned';
      moved = true;
    }
    if (!moved)
      changes.push({
        type: 'skip',
        workout_id: w.id,
        reason:
          'No easy day in the next 3 days fits without back-to-back hard sessions.',
      });
  }
  return changes;
}

/** Alternatives when conditions make a session's planned route unsuitable. */
export function alternatives(
  workout: { kind: string; planned_distance_m: number | null },
  routes: { id: string; title: string; distance_m: number; status: string }[],
) {
  const target = workout.planned_distance_m ?? 0;
  const out: {
    type: 'route' | 'indoor' | 'swap';
    text: string;
    route_id?: string;
  }[] = routes
    .filter(
      (r) =>
        r.status === 'no_current_reports' &&
        (!target || Math.abs(r.distance_m - target) <= 0.2 * target),
    )
    .slice(0, 3)
    .map((r) => ({
      type: 'route' as const,
      route_id: r.id,
      text: `Run "${r.title}" (${(r.distance_m / 1000).toFixed(1)} km) — no current reports along it.`,
    }));
  out.push({
    type: 'indoor',
    text: HARD.includes(workout.kind as Kind)
      ? 'Do the same structure on a treadmill or indoor track (set 1% incline for road-like effort).'
      : 'Run easy indoors or cross-train for the same time.',
  });
  if (HARD.includes(workout.kind as Kind))
    out.push({
      type: 'swap',
      text: 'Swap with an easy day later this week if conditions improve; keep hard days 2 days apart.',
    });
  return out;
}
