import 'server-only';
import { z } from 'zod';
import { PermanentError, TransientError } from '../server/errors';
import { corosClient } from '../coros/session';
import { toGpx } from '../gpx';
import { validate } from '../coros/schema';
import { toCourse, ymd } from '../coros/workout';
import { steps as stepsSchema } from '../training/steps';
import { loadAccount, requireTool } from './coros-sync';
import type { JobContext } from './runner';

/**
 * Writes to COROS are never retried blindly: per COROS's own guidance, an
 * interrupted write may still have succeeded, so the user is asked to check the
 * app instead of risking a duplicate.
 */
async function once<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TransientError)
      throw new PermanentError(
        'COROS did not confirm the result. Check the COROS app before trying again.',
        'outcome_uncertain',
      );
    throw e;
  }
}
const text = (r: { content?: { text?: string }[] }) =>
  (r.content ?? [])
    .map((c) => c.text ?? '')
    .join(' ')
    .trim()
    .slice(0, 300);

export async function pushRoute({ db, job }: JobContext) {
  const p = z.object({ route_id: z.uuid() }).safeParse(job.payload);
  if (!p.success)
    throw new PermanentError('Invalid job payload.', 'bad_payload');
  const { data: route, error } = await db
    .from('routes')
    .select('title,description,path:path::json')
    .eq('id', p.data.route_id)
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (error) throw new TransientError('Database unavailable.', 'db');
  const coords = (route?.path as { coordinates?: number[][] } | null)
    ?.coordinates;
  if (!route || !coords || coords.length < 2)
    throw new PermanentError('Route has no mapped geometry.', 'no_geometry');
  const account = await loadAccount(db, job.user_id);
  requireTool(account, 'uploadRouteFile');
  const client = await corosClient(db, account);
  const name = route.title.slice(0, 95);
  const result = await once(() =>
    client.callTool('uploadRouteFile', {
      fileName:
        name
          .replace(/[^A-Za-z0-9 _-]+/g, '')
          .trim()
          .replace(/\s+/g, '-') + '.gpx',
      fileContent: toGpx(name, coords, route.description),
      routeType: 2, // walking, running, trail running or hiking
      routeName: name,
    }),
  );
  if (result.isError)
    throw new PermanentError(
      'COROS rejected the route: ' + text(result),
      'coros_rejected',
    );
  // "Accepted" means submitted for processing, not that the import finished (COROS tool guide).
  return { accepted: true, message: text(result) };
}

/**
 * Push one structured workout: scheduled on its date when that date is within the
 * documented window (today..+90 days in the COROS account timezone), otherwise saved
 * to the workout library. The payload is validated against the tool's live schema.
 */
export async function pushWorkout({ db, job }: JobContext) {
  const p = z.object({ workout_id: z.uuid() }).safeParse(job.payload);
  if (!p.success)
    throw new PermanentError('Invalid job payload.', 'bad_payload');
  const { data: w, error } = await db
    .from('workouts')
    .select('title,description,scheduled_on,steps,kind')
    .eq('id', p.data.workout_id)
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (error) throw new TransientError('Database unavailable.', 'db');
  if (!w) throw new PermanentError('Workout not found.', 'not_found');
  const steps = stepsSchema.safeParse(w.steps);
  if (!steps.success || !steps.data.length)
    throw new PermanentError(
      'Add structured steps before sending to COROS.',
      'no_steps',
    );
  const days =
    (Date.parse(w.scheduled_on + 'T00:00:00Z') -
      Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) /
    86400000;
  const tool =
    days >= 0 && days <= 90 ? 'createScheduledWorkout' : 'createSingleWorkout';
  const account = await loadAccount(db, job.user_id);
  requireTool(account, tool);
  const client = await corosClient(db, account);
  const schema = (await client.listTools()).find((t) => t.name === tool)
    ?.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const args: Record<string, unknown> = {
    course: toCourse({
      title: w.title,
      description: w.description,
      steps: steps.data,
    }),
  };
  if (tool === 'createScheduledWorkout') args.date = ymd(w.scheduled_on);
  const problems = validate(args, schema as never);
  if (!schema || problems.length)
    throw new PermanentError(
      "COROS's current workout format isn't supported by KindaMoving's exporter yet (" +
        (problems.slice(0, 3).join('; ') || 'no schema') +
        '). Create it in the COROS app; nothing was sent.',
      'schema_mismatch',
    );
  const result = await once(() => client.callTool(tool, args));
  if (result.isError)
    throw new PermanentError(
      'COROS rejected the workout: ' + text(result),
      'coros_rejected',
    );
  return { tool, message: text(result) };
}
