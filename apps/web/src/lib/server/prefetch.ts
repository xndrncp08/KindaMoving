import 'server-only';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resource } from '@km/types';
import { columns } from '@/lib/api';
import { keys } from '@/lib/query-keys';

/**
 * Server-side prefetch for the first paint on slow mobile networks: the same
 * RLS-scoped queries and response shapes as the matching API routes, placed in
 * a dehydrated TanStack cache so the client renders without its own round trip.
 * Any failure is skipped; the client then fetches as usual.
 */
export async function prefetch(
  db: SupabaseClient,
  userId: string,
  want: { lists?: Resource[]; profile?: boolean; detail?: [Resource, string] },
) {
  const client = new QueryClient();
  const jobs: Promise<unknown>[] = [];
  for (const name of want.lists ?? [])
    jobs.push(
      (async () => {
        const { data, error } = await db
          .from(name)
          .select(columns[name].list)
          .eq('user_id', userId)
          .order(name === 'activities' ? 'started_at' : 'created_at', {
            ascending: false,
          })
          .limit(500);
        if (!error) client.setQueryData(keys.resource(userId, name), data);
      })(),
    );
  if (want.profile)
    jobs.push(
      (async () => {
        const { data, error } = await db
          .from('profiles')
          .select('*,user_preferences(*)')
          .eq('id', userId)
          .maybeSingle();
        if (error) return;
        const { user_preferences, ...profile } = data ?? {};
        client.setQueryData(
          keys.resource(userId, 'profile'),
          data ? { ...profile, ...user_preferences } : null,
        );
      })(),
    );
  if (want.detail) {
    const [name, id] = want.detail;
    jobs.push(
      (async () => {
        const { data, error } = await db
          .from(name)
          .select(columns[name].detail)
          .eq('id', id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!error && data)
          client.setQueryData([...keys.resource(userId, name), id], data);
      })(),
    );
  }
  await Promise.allSettled(jobs);
  return dehydrate(client);
}
