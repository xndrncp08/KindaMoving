import 'server-only';
import { z } from 'zod';
import { analytics } from '../server/analytics';
import { weatherAt } from '../server/weather';
import { PermanentError, TransientError } from '../server/errors';
import type { JobContext } from './runner';

export const timeZone = z
  .string()
  .max(64)
  .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/);
const payload = z.object({ upload_id: z.uuid(), tz: timeZone.optional() });

/** Processes a stored GPX/FIT upload into an activity. Idempotent on the file hash. */
export async function importUpload({ db, job, heartbeat }: JobContext) {
  const parsed = payload.safeParse(job.payload);
  if (!parsed.success)
    throw new PermanentError('Invalid job payload.', 'bad_payload');
  // The service role bypasses RLS, so ownership is re-checked explicitly here.
  const { data: upload, error } = await db
    .from('activity_uploads')
    .select('id,user_id,format,object_path,sha256,status')
    .eq('id', parsed.data.upload_id)
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (error) throw new TransientError('Database unavailable.', 'db');
  if (!upload) throw new PermanentError('Upload not found.', 'not_found');
  await db
    .from('activity_uploads')
    .update({ status: 'processing' })
    .eq('id', upload.id);
  const file = await db.storage
    .from('activity-files')
    .download(upload.object_path);
  if (file.error || !file.data)
    throw new TransientError('Stored file unavailable.', 'storage');
  await heartbeat({ stage: 'parsing' });
  try {
    const result = await analytics<Record<string, unknown>>(
      `/v1/activities/parse?format=${upload.format}` +
        (parsed.data.tz ? '&tz=' + encodeURIComponent(parsed.data.tz) : ''),
      {
        method: 'POST',
        body: await file.data.arrayBuffer(),
        headers: { 'Content-Type': 'application/octet-stream' },
      },
    );
    await heartbeat({ stage: 'saving' });
    const saved = await db.rpc('import_activity', {
      p_user: job.user_id,
      p_source: 'file',
      p_source_ref: upload.sha256 ?? upload.id,
      p_upload: upload.id,
      p: result,
    });
    if (saved.error)
      throw new TransientError('Import could not be saved.', 'db');
    const outcome = saved.data as { activity_id: string; outcome: string };
    await attachWeather(db, job.user_id, outcome, result);
    return { ...outcome, warnings: result.warnings };
  } catch (e) {
    if (e instanceof PermanentError)
      await db.rpc('mark_upload', {
        p_user: job.user_id,
        p_upload: upload.id,
        p_status: 'failed',
        p_error: e.message,
      });
    throw e;
  }
}

/** Environmental context for newly created/merged activities; never fails the import. */
export async function attachWeather(
  db: JobContext['db'],
  userId: string,
  outcome: { activity_id: string; outcome: string },
  result: Record<string, unknown>,
) {
  if (!['created', 'merged'].includes(outcome.outcome)) return;
  const first = (result.track as { coordinates?: [number, number][] } | null)
    ?.coordinates?.[0];
  if (!first || typeof result.start_time !== 'string') return;
  const weather = await weatherAt(first[1], first[0], result.start_time);
  if (weather)
    await db
      .from('activities')
      .update({ weather })
      .eq('id', outcome.activity_id)
      .eq('user_id', userId);
}
