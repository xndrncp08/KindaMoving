import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import {
  reconcile,
  type PlanWorkout,
  type Run,
} from '@/lib/training/reconcile';
import { trainingContext } from '@/lib/server/training';
/** Calendar window with compliance and proposed changes (computed, not written). */
export async function GET(request: Request) {
  try {
    const p = z
      .object({ from: z.iso.date(), to: z.iso.date(), today: z.iso.date() })
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!p.success || p.data.to < p.data.from)
      throw new ApiError(400, 'Invalid range.');
    const { db, user } = await context(request);
    const lookback = new Date(Date.parse(p.data.today) - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const from = p.data.from < lookback ? p.data.from : lookback;
    const [workouts, runs, ctx] = await Promise.all([
      db
        .from('workouts')
        .select(
          'id,title,scheduled_on,kind,status,completed,planned_distance_m,activity_id,route_id,compliance,moved_from,plan_id,steps,description',
        )
        .eq('user_id', user.id)
        .gte('scheduled_on', from)
        .lte('scheduled_on', p.data.to)
        .order('scheduled_on')
        .limit(500),
      db
        .from('activities')
        .select('id,started_at,distance_m,sport,moving_s,elapsed_s')
        .eq('user_id', user.id)
        .gte('started_at', from)
        .lte('started_at', p.data.today)
        .limit(500),
      trainingContext(db, user.id, p.data.today),
    ]);
    check(workouts.error);
    check(runs.error);
    const changes = reconcile(
      (workouts.data ?? []) as PlanWorkout[],
      (runs.data ?? []) as Run[],
      p.data.today,
    );
    return NextResponse.json(
      { workouts: workouts.data, runs: runs.data, changes, paces: ctx.paces },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
