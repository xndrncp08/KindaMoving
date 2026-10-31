import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { steps, totals } from '@/lib/training/steps';
/** Replace a workout's structure; planned distance is derived from the steps. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Workout not found.');
    const { db, user } = await context(request);
    const body = z
      .object({
        kind: z.enum([
          'easy',
          'long',
          'tempo',
          'intervals',
          'recovery',
          'race',
          'cross',
          'rest',
        ]),
        steps,
        route_id: z.uuid().nullable().default(null),
      })
      .safeParse(await request.json());
    if (!body.success)
      throw new ApiError(
        400,
        body.error.issues[0]?.message ?? 'Invalid workout structure.',
      );
    const { data, error } = await db
      .from('workouts')
      .update({
        kind: body.data.kind,
        steps: body.data.steps,
        route_id: body.data.route_id,
        planned_distance_m: body.data.steps.length
          ? totals(body.data.steps).distance_m
          : null,
      })
      .eq('id', id.data)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    check(error);
    if (!data) throw new ApiError(404, 'Workout not found.');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
