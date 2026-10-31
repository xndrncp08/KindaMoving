import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
/** Previous completed workouts of the same kind with their recorded runs (training-history comparison). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Workout not found.');
    const { db, user } = await context(request);
    const { data: w, error } = await db
      .from('workouts')
      .select('kind,scheduled_on')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!w) throw new ApiError(404, 'Workout not found.');
    const { data, error: e2 } = await db
      .from('workouts')
      .select(
        'id,title,scheduled_on,planned_distance_m,compliance,activity:activities!workouts_activity(id,distance_m,moving_s,elapsed_s,avg_hr,pace:metrics->pace_s_per_km)',
      )
      .eq('user_id', user.id)
      .eq('kind', w.kind)
      .eq('status', 'completed')
      .lt('scheduled_on', w.scheduled_on)
      .not('activity_id', 'is', null)
      .order('scheduled_on', { ascending: false })
      .limit(8);
    check(e2);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
