import 'server-only';
import { z } from 'zod';
import { PermanentError, TransientError } from '../server/errors';
import { corosClient } from '../coros/session';
import { toGpx } from '../gpx';
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
