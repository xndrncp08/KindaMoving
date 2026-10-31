import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { context, failure, check, ApiError } from '@/lib/api';
import { kickJobs } from '@/lib/jobs/kick';
/** History of state transitions for one job (diagnostics). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Job not found.');
    const { db } = await context(request);
    const { data, error } = await db
      .from('sync_job_events')
      .select('from_status,to_status,detail,created_at')
      .eq('job_id', id.data)
      .order('id');
    check(error);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
/** `{action:'cancel'|'retry'}`. Retry re-enqueues with the job's own idempotency key. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Job not found.');
    const { db, user } = await context(request);
    const { action } = z
      .object({ action: z.enum(['cancel', 'retry']) })
      .parse(await request.json());
    if (action === 'cancel') {
      const { data, error } = await db.rpc('cancel_job', { p_id: id.data });
      check(error);
      return NextResponse.json({ status: data });
    }
    const { data: job, error } = await db
      .from('sync_jobs')
      .select('kind,payload,idempotency_key,status')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!job || job.status !== 'failed' || !job.idempotency_key)
      throw new ApiError(409, 'Only failed jobs can be retried.');
    const retried = await db.rpc('enqueue_job', {
      p_kind: job.kind,
      p_payload: job.payload,
      p_key: job.idempotency_key,
    });
    check(retried.error);
    after(() => kickJobs([job.kind]));
    return NextResponse.json({ status: 'queued' });
  } catch (e) {
    return failure(e);
  }
}
