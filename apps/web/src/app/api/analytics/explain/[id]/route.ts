import { NextResponse } from 'next/server';
import { z } from 'zod';
import { columns, context, failure, check, ApiError } from '@/lib/api';
import { analytics } from '@/lib/server/analytics';
import { PermanentError, TransientError } from '@/lib/server/errors';
/** "Why was this run different?" for one owned activity. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Activity not found.');
    const { db, user } = await context(request);
    const { data: target, error } = await db
      .from('activities')
      .select(columns.activities.detail)
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!target) throw new ApiError(404, 'Activity not found.');
    const t = target as unknown as Record<string, unknown> & {
      start_time: string | null;
      track: { coordinates: number[][] } | null;
    };
    if (!t.start_time)
      return NextResponse.json({
        status: 'not_applicable',
        message: 'Manual entries have no recorded detail to compare.',
      });
    const [candidates, history] = await Promise.all([
      db.rpc('comparable_candidates', { p_activity: id.data }),
      db
        .from('activities')
        .select('start_time,distance_m')
        .eq('user_id', user.id)
        .not('start_time', 'is', null)
        .lt('start_time', t.start_time)
        .gte(
          'start_time',
          new Date(Date.parse(t.start_time) - 60 * 86400000).toISOString(),
        )
        .limit(500),
    ]);
    check(candidates.error);
    check(history.error);
    try {
      const result = await analytics('/v1/analyze/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: { ...t, track_coords: t.track?.coordinates ?? null },
          candidates: candidates.data,
          history: history.data,
        }),
        timeoutMs: 15000,
      });
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    } catch (e) {
      if (e instanceof TransientError)
        throw new ApiError(503, 'Analysis is temporarily unavailable.');
      if (e instanceof PermanentError) throw new ApiError(422, e.message);
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
