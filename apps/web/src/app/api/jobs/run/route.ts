import { NextResponse } from 'next/server';
import { runJobs } from '@/lib/jobs/runner';
export const maxDuration = 60;
/**
 * Durable queue drain for a scheduler (e.g. Vercel Cron every minute) using
 * `Authorization: Bearer $CRON_SECRET`. Constant-time comparison.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get('authorization') ?? '';
  const expected = 'Bearer ' + (secret ?? '');
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a[i] ^ b[i];
  if (!secret || secret.length < 32 || diff !== 0)
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
    return NextResponse.json({
      processed: await runJobs({ limit: 20, budgetMs: 50000 }),
    });
  } catch (e) {
    console.error('[jobs] run failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Runner failed.' }, { status: 500 });
  }
}
