import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { kickJobs } from '@/lib/jobs/kick';
/** Queue a confirmed workout push to COROS (explicit `confirm: true`; external mutation). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Workout not found.');
    const { db, user } = await context(request);
    if (
      !z
        .object({ confirm: z.literal(true) })
        .safeParse(await request.json().catch(() => ({}))).success
    )
      throw new ApiError(
        400,
        'Confirmation is required before sending to COROS.',
      );
    const { data: account } = await db
      .from('connected_provider_accounts')
      .select('status')
      .eq('user_id', user.id)
      .eq('provider', 'coros')
      .maybeSingle();
    if (account?.status !== 'connected')
      throw new ApiError(409, 'Connect COROS in Settings first.');
    const { data: w } = await db
      .from('workouts')
      .select('id,updated_at')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!w) throw new ApiError(404, 'Workout not found.');
    const { data, error } = await db.rpc('enqueue_job', {
      p_kind: 'coros_workout_push',
      p_payload: { workout_id: w.id },
      p_key: `${w.id}@${w.updated_at}`,
    });
    check(error);
    after(() => kickJobs(['coros_workout_push']));
    return NextResponse.json({ job_id: data });
  } catch (e) {
    return failure(e);
  }
}
