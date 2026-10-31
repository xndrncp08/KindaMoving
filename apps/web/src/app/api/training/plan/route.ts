import { NextResponse } from 'next/server';
import { ApiError, context, failure, check } from '@/lib/api';
import { buildPlan, planRequest } from '@/lib/server/training';
import { PlanError } from '@/lib/training/plan';
/** `?preview=1` returns the plan; otherwise the plan is regenerated server-side and saved atomically. */
export async function POST(request: Request) {
  try {
    const { db, user } = await context(request);
    const body = planRequest.safeParse(await request.json());
    if (!body.success)
      throw new ApiError(
        400,
        body.error.issues[0]?.message ?? 'Invalid plan request.',
      );
    let plan;
    try {
      plan = await buildPlan(db, user.id, body.data);
    } catch (e) {
      if (e instanceof PlanError) throw new ApiError(400, e.message);
      throw e;
    }
    if (new URL(request.url).searchParams.get('preview'))
      return NextResponse.json(plan);
    const { data, error } = await db.rpc('create_training_plan', {
      p_plan: {
        title: `${body.data.race} plan · ${body.data.race_date}`,
        starts_on: plan.start_date,
        ends_on: body.data.race_date,
        goal: `${body.data.race} on ${body.data.race_date}`,
        race: body.data.race,
        race_date: body.data.race_date,
        settings: {
          run_days: body.data.run_days,
          long_run_day: body.data.long_run_day,
          experience: plan.experience,
          start_weekly_m: plan.start_m,
          peak_weekly_m: plan.peak_m,
          volume_basis: plan.volume_basis,
        },
        paces: plan.paces,
      },
      p_workouts: plan.workouts,
    });
    check(error);
    return NextResponse.json(
      { id: data, workouts: plan.workouts.length },
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
