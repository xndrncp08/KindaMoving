import type { Job, JobStatus } from '@km/types';
/**
 * Client view of the server job state machine. Server rows are authoritative;
 * this module only derives *transitions* between successive snapshots so that
 * dependent caches are invalidated exactly once per completed job.
 */
export const ACTIVE: JobStatus[] = ['queued', 'running', 'retry_wait'];
export const isActive = (j: Pick<Job, 'status'>) => ACTIVE.includes(j.status);

/** Query resources (keys under ['user', id, <resource>]) affected when a job succeeds. */
export const jobEffects: Record<string, string[]> = {
  activity_import: [
    'activities',
    'summary',
    'analytics',
    'shoes',
    'workouts',
    'uploads',
    'gear-analytics',
    'training',
  ],
  coros_sync: [
    'activities',
    'summary',
    'analytics',
    'shoes',
    'workouts',
    'coros',
    'gear-analytics',
    'training',
  ],
  coros_fit_import: [
    'activities',
    'summary',
    'analytics',
    'shoes',
    'workouts',
    'gear-analytics',
    'training',
  ],
  coros_workout_push: ['workouts', 'coros'],
  coros_route_push: ['routes', 'coros'],
  form_analysis: ['form'],
};

export type Seen = Map<string, { status: JobStatus; updated_at: string }>;
export interface Transition {
  job: Job;
  from: JobStatus | null;
  to: JobStatus;
}
/**
 * Compare a new snapshot against what was seen. A row whose `updated_at` is
 * older than the one already seen is a stale (out-of-order) response and is
 * ignored, so a slow poll can never "rewind" a finished job to running.
 */
export function diffJobs(seen: Seen, jobs: Job[]): Transition[] {
  const out: Transition[] = [];
  for (const job of jobs) {
    const prev = seen.get(job.id);
    if (prev && Date.parse(job.updated_at) < Date.parse(prev.updated_at))
      continue;
    if (!prev || prev.status !== job.status)
      out.push({ job, from: prev?.status ?? null, to: job.status });
    seen.set(job.id, { status: job.status, updated_at: job.updated_at });
  }
  return out;
}
