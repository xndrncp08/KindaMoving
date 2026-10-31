import 'server-only';
import { backgroundConfigured } from '../supabase/admin';
import { runJobs } from './runner';
/**
 * Best-effort immediate processing after a request (via `after()`). Durable
 * progress never depends on it: the cron runner picks up anything left queued.
 */
export async function kickJobs(kinds?: string[]) {
  if (!backgroundConfigured()) return;
  try {
    await runJobs({ limit: 3, kinds, budgetMs: 40000 });
  } catch (e) {
    console.error('[jobs] kick failed', e instanceof Error ? e.message : e);
  }
}
