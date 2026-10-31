import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, failure, check, ApiError } from '@/lib/api';
import { overview, type HistoryRow } from '@/lib/analytics';
/** Personal bests, weekly volume/load and consistency over the caller's last 365 days. */
export async function GET(request: Request) {
  try {
    const today = z.iso
      .date()
      .safeParse(new URL(request.url).searchParams.get('today'));
    if (!today.success) throw new ApiError(400, 'Invalid date.');
    const { db, user } = await context(request);
    const since = new Date(Date.parse(today.data) - 365 * 86400000)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await db
      .from('activities')
      .select(
        'id,title,sport,started_at,start_time,distance_m,moving_s,elapsed_s,max_hr,best_efforts:metrics->best_efforts,hr_histogram:metrics->hr_histogram',
      )
      .eq('user_id', user.id)
      .gte('started_at', since)
      .order('started_at')
      .limit(2000);
    check(error);
    return NextResponse.json(
      overview((data ?? []) as unknown as HistoryRow[], today.data),
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
