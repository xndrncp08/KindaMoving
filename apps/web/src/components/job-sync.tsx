'use client';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { jobsQuery, keys } from '@/lib/queries';
import { diffJobs, jobEffects, type Seen } from '@/lib/sync';
const labels: Record<string, string> = {
  activity_import: 'Activity import',
  coros_sync: 'COROS sync',
  coros_fit_import: 'COROS activity import',
  coros_workout_push: 'Workout sent to COROS',
  coros_route_push: 'Route sent to COROS',
  form_analysis: 'Form analysis',
};
/**
 * Mounted once in the app shell. Turns job completions into targeted cache
 * invalidation so every module (history, analytics, gear, training) refreshes
 * from the server instead of patching local copies.
 */
export function JobSync({ userId }: { userId: string }) {
  const client = useQueryClient();
  const { data } = useQuery(jobsQuery(userId));
  const seen = useRef<Seen | null>(null);
  useEffect(() => {
    if (!data) return;
    const first = seen.current === null;
    seen.current ??= new Map();
    const transitions = diffJobs(seen.current, data);
    if (first) return; // the initial snapshot is history, not news
    for (const { job, to } of transitions) {
      if (to === 'succeeded') {
        for (const resource of jobEffects[job.kind] ?? [])
          void client.invalidateQueries({
            queryKey: keys.resource(userId, resource),
          });
        toast.success((labels[job.kind] ?? 'Job') + ' finished.');
      } else if (to === 'failed') {
        toast.error(
          (labels[job.kind] ?? 'Job') +
            ' failed: ' +
            (job.error_message ?? 'unknown error'),
        );
      }
    }
  }, [data, client, userId]);
  return null;
}
