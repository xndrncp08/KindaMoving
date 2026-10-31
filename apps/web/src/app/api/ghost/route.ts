import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { analyticsApi } from '@/lib/server/analytics';
/** Ghost alignment of two owned runs: `a` is the reference, `b` the ghost. */
export async function GET(request: Request) {
  try {
    const q = z
      .object({ a: z.uuid(), b: z.uuid() })
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!q.success || q.data.a === q.data.b)
      throw new ApiError(400, 'Choose two different runs.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('activity_streams')
      .select('activity_id,data')
      .eq('user_id', user.id)
      .in('activity_id', [q.data.a, q.data.b]);
    check(error);
    const ref = data?.find((r) => r.activity_id === q.data.a);
    const ghost = data?.find((r) => r.activity_id === q.data.b);
    if (!ref || !ghost)
      throw new ApiError(
        404,
        'Both runs need recorded GPS detail (file import or COROS).',
      );
    const result = await analyticsApi(
      '/v1/ghost/align',
      { ref: { streams: ref.data }, ghost: { streams: ghost.data } },
      30000,
    );
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
