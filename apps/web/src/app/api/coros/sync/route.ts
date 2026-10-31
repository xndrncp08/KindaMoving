import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { kickJobs } from '@/lib/jobs/kick';
/** Queue a sync (optionally a backfill). Repeated clicks within a minute share one job. */
export async function POST(request: Request) {
  try {
    const { db, user } = await context(request);
    const { backfill_days } = z
      .object({ backfill_days: z.number().int().min(1).max(365).optional() })
      .parse(await request.json().catch(() => ({})));
    const { data: account } = await db
      .from('connected_provider_accounts')
      .select('status')
      .eq('user_id', user.id)
      .eq('provider', 'coros')
      .maybeSingle();
    if (account?.status !== 'connected')
      throw new ApiError(409, 'Connect COROS first.');
    const { data, error } = await db.rpc('enqueue_job', {
      p_kind: 'coros_sync',
      p_payload: backfill_days ? { backfill_days } : {},
      p_key: `manual-${backfill_days ?? 0}-${new Date().toISOString().slice(0, 16)}`,
    });
    check(error);
    after(() => kickJobs(['coros_sync']));
    return NextResponse.json({ job_id: data });
  } catch (e) {
    return failure(e);
  }
}
