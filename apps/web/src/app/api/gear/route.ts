import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
/** Gear analytics computed in SQL from current activities, plus recent unassigned runs. */
export async function GET(request: Request) {
  try {
    const today = z.iso
      .date()
      .safeParse(new URL(request.url).searchParams.get('today'));
    if (!today.success) throw new ApiError(400, 'Invalid date.');
    const { db, user } = await context(request);
    const since = new Date(Date.parse(today.data) - 90 * 86400000)
      .toISOString()
      .slice(0, 10);
    const [analytics, unassigned] = await Promise.all([
      db.rpc('gear_analytics', { p_today: today.data }),
      db
        .from('activities')
        .select('id,title,started_at,distance_m,sport')
        .eq('user_id', user.id)
        .is('shoe_id', null)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(100),
    ]);
    check(analytics.error);
    check(unassigned.error);
    return NextResponse.json(
      { ...(analytics.data as object), unassigned: unassigned.data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
