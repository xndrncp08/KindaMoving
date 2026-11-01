import { NextResponse } from 'next/server';
import { runJobs } from '@/lib/jobs/runner';
import { cronAuthorized } from '@/lib/server/cron';
export const maxDuration = 300;
/**
 * Durable queue drain for a scheduler (e.g. Vercel Cron every minute) using
 * `Authorization: Bearer $CRON_SECRET` (constant-time check in lib/server/cron).
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    return NextResponse.json({
      processed: await runJobs({ limit: 20, budgetMs: 100000 }),
    });
  } catch (e) {
    console.error('[jobs] run failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Runner failed.' }, { status: 500 });
  }
}
