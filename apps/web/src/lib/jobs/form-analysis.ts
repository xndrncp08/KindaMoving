import 'server-only';
import { z } from 'zod';
import { analytics } from '../server/analytics';
import { PermanentError, TransientError } from '../server/errors';
import type { JobContext } from './runner';
/**
 * Analyse an uploaded running video. Retention: the original is deleted as soon as
 * analysis finishes (success or permanent failure); the annotated output (faces
 * blurred) expires after 7 days (see /api/form/cleanup).
 */
export async function analyzeForm({ db, job, heartbeat }: JobContext) {
  const p = z.object({ analysis_id: z.uuid() }).safeParse(job.payload);
  if (!p.success)
    throw new PermanentError('Invalid job payload.', 'bad_payload');
  const { data: row, error } = await db
    .from('form_analyses')
    .select('id,user_id,video_path')
    .eq('id', p.data.analysis_id)
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (error) throw new TransientError('Database unavailable.', 'db');
  if (!row?.video_path)
    throw new PermanentError('Video not found.', 'not_found');
  const fail = async (message: string) => {
    await db
      .from('form_analyses')
      .update({
        status: 'failed',
        error: message.slice(0, 500),
        video_path: null,
      })
      .eq('id', row.id);
    await db.storage.from('form-videos').remove([row.video_path!]);
  };
  await db
    .from('form_analyses')
    .update({ status: 'processing' })
    .eq('id', row.id);
  const file = await db.storage.from('form-videos').download(row.video_path);
  if (file.error || !file.data)
    throw new TransientError('Stored video unavailable.', 'storage');
  await heartbeat({ stage: 'analysing' });
  const suffix = (row.video_path.split('.').pop() ?? 'mp4').toLowerCase();
  let result: Record<string, unknown> & { annotated_mp4_base64?: string };
  try {
    result = await analytics(
      `/v1/form/analyze?suffix=${encodeURIComponent(suffix)}&annotate=true`,
      {
        method: 'POST',
        body: await file.data.arrayBuffer(),
        headers: { 'Content-Type': 'application/octet-stream' },
        timeoutMs: 170000,
      },
    );
  } catch (e) {
    if (e instanceof PermanentError) await fail(e.message);
    throw e;
  }
  const { annotated_mp4_base64, ...metrics } = result;
  let annotated: string | null = null;
  if (annotated_mp4_base64) {
    annotated = `${job.user_id}/${row.id}.mp4`;
    const up = await db.storage
      .from('form-results')
      .upload(annotated, Buffer.from(annotated_mp4_base64, 'base64'), {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (up.error) annotated = null;
  }
  await db
    .from('form_analyses')
    .update({
      status: 'complete',
      result: metrics,
      annotated_path: annotated,
      video_path: null,
      error: null,
    })
    .eq('id', row.id);
  await db.storage.from('form-videos').remove([row.video_path]);
  return { analysis_id: row.id, usable: metrics.usable };
}
