import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
const change = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('link'),
    workout_id: z.uuid(),
    activity_id: z.uuid(),
    compliance: z.enum(['completed', 'partial']),
    ratio: z.number().min(0).max(10),
  }),
  z.object({ type: z.literal('missed'), workout_id: z.uuid() }),
  z.object({
    type: z.literal('skip'),
    workout_id: z.uuid(),
    reason: z.string().max(200),
  }),
  z.object({
    type: z.literal('move'),
    workout_id: z.uuid(),
    to: z.iso.date(),
    reason: z.string().max(200),
  }),
]);
/** Apply reconciliation changes the athlete accepted (RLS limits them to their own workouts). */
export async function POST(request: Request) {
  try {
    const { db } = await context(request);
    const body = z
      .object({ changes: z.array(change).min(1).max(200) })
      .safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Invalid changes.');
    const { data, error } = await db.rpc('apply_training_changes', {
      p_changes: body.data.changes,
    });
    check(error);
    return NextResponse.json({ applied: data });
  } catch (e) {
    return failure(e);
  }
}
