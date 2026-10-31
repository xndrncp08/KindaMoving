import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin } from '../supabase/admin';
import {
  backoff,
  CancelledError,
  PermanentError,
  TransientError,
} from '../server/errors';

export interface Job {
  id: string;
  user_id: string;
  account_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  progress: Record<string, unknown>;
}
export interface JobContext {
  db: SupabaseClient;
  job: Job;
  /** Extends the lease and reports progress; throws CancelledError if the user cancelled. */
  heartbeat: (progress?: Record<string, unknown>) => Promise<void>;
}
export type Handler = (ctx: JobContext) => Promise<unknown>;

const LEASE_S = 120;
const registry: Record<string, () => Promise<Handler>> = {
  activity_import: async () => (await import('./activity-import')).importUpload,
  coros_sync: async () => (await import('./coros-sync')).corosSync,
  coros_route_push: async () => (await import('./coros-push')).pushRoute,
  coros_workout_push: async () => (await import('./coros-push')).pushWorkout,
};

/**
 * Claims and executes due jobs until the time budget is spent. Safe to run
 * concurrently: claims use SKIP LOCKED leases, and a worker that dies mid-job
 * has its lease expire and the job is re-queued by the next claim.
 */
export async function runJobs({
  limit = 5,
  kinds,
  budgetMs = 45000,
}: { limit?: number; kinds?: string[]; budgetMs?: number } = {}) {
  const db = admin();
  const worker = 'web-' + crypto.randomUUID();
  const deadline = Date.now() + budgetMs;
  const outcomes: { id: string; kind: string; status: string }[] = [];
  while (Date.now() < deadline) {
    const { data, error } = await db.rpc('claim_jobs', {
      p_worker: worker,
      p_limit: 1,
      p_lease_s: LEASE_S,
      p_kinds: kinds ?? null,
    });
    if (error) throw error;
    const job = (data as Job[] | null)?.[0];
    if (!job) break;
    outcomes.push({
      id: job.id,
      kind: job.kind,
      status: await execute(db, worker, job),
    });
    if (outcomes.length >= limit) break;
  }
  return outcomes;
}

export async function execute(db: SupabaseClient, worker: string, job: Job) {
  const heartbeat = async (progress?: Record<string, unknown>) => {
    const { data, error } = await db.rpc('heartbeat_job', {
      p_id: job.id,
      p_worker: worker,
      p_lease_s: LEASE_S,
      p_progress: progress ?? null,
    });
    if (error) throw new TransientError('Lease lost.', 'lease_lost');
    if (data === true) throw new CancelledError('Cancelled by user.');
  };
  const finish = async (
    status: 'succeeded' | 'failed' | 'cancelled',
    result: unknown,
    code: string | null,
    message: string | null,
    retryAfter: number | null,
  ) => {
    const { data, error } = await db.rpc('finish_job', {
      p_id: job.id,
      p_worker: worker,
      p_status: status,
      p_result: result ?? null,
      p_code: code,
      p_message: message,
      p_retry_after_s: retryAfter,
    });
    // A lost lease means another worker owns the job now; never overwrite its outcome.
    return error ? 'lease_lost' : (data as string);
  };
  try {
    const load = registry[job.kind];
    if (!load) throw new PermanentError('Unsupported job kind.', 'unsupported');
    const result = await (await load())({ db, job, heartbeat });
    return finish('succeeded', result, null, null, null);
  } catch (e) {
    if (e instanceof CancelledError)
      return finish('cancelled', null, 'cancelled', e.message, null);
    if (e instanceof PermanentError)
      return finish('failed', null, e.code, e.message, null);
    const transient = e instanceof TransientError;
    const wait = Math.max(
      transient && e.retryAfterS ? e.retryAfterS : 0,
      backoff(job.attempts),
    );
    return finish(
      'failed',
      null,
      transient ? e.code : 'unexpected',
      transient ? e.message : 'Unexpected error; will retry.',
      wait,
    );
  }
}
