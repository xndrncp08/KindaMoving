'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, ErrorState, Skeleton } from '@km/ui';
import { api, keys, trainingQuery } from '@/lib/queries';
import { duration } from '@/lib/metrics';
import type { Change } from '@/lib/training/reconcile';
export function TrainingOverview({ userId }: { userId: string }) {
  const client = useQueryClient();
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const q = useQuery(trainingQuery(userId, monday.toLocaleDateString('en-CA')));
  const apply = useMutation({
    mutationFn: (changes: Change[]) =>
      api<{ applied: number }>('training/apply', {
        method: 'POST',
        body: JSON.stringify({ changes }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'training'),
      });
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'workouts'),
      });
    },
  });
  // Linking a recorded run to its planned workout is non-destructive, so it happens automatically.
  const linked = useRef(new Set<string>());
  useEffect(() => {
    const links = (q.data?.changes ?? []).filter(
      (c) => c.type === 'link' && !linked.current.has(c.workout_id),
    );
    if (!links.length || apply.isPending) return;
    links.forEach((c) => linked.current.add(c.workout_id));
    apply.mutate(links, {
      onSuccess: (r) =>
        r.applied &&
        toast.success(`${r.applied} workout(s) matched to your runs.`),
    });
  }, [q.data, apply]);
  if (q.isPending) return <Skeleton />;
  if (q.error)
    return (
      <ErrorState message={q.error.message} retry={() => void q.refetch()} />
    );
  const proposals = q.data.changes.filter((c) => c.type !== 'link');
  const week = q.data.workouts.filter(
    (w) => w.scheduled_on >= monday.toLocaleDateString('en-CA'),
  );
  const title = (id: string) => q.data.workouts.find((w) => w.id === id);
  const z = q.data.paces.zones;
  return (
    <div className="grid two">
      <Card>
        <h2>This week</h2>
        <p className="metric">
          {week.filter((w) => w.status === 'completed').length}/
          {week.filter((w) => w.kind !== 'rest').length} done
        </p>
        <p className="muted">
          {week.filter((w) => w.compliance?.grade === 'partial').length} partial
          ·{' '}
          {
            week.filter((w) => w.status === 'missed' || w.status === 'skipped')
              .length
          }{' '}
          missed or skipped
        </p>
        {proposals.length > 0 && (
          <div className="stack">
            <h3>Suggested changes</h3>
            <ul>
              {proposals.map((c, i) => (
                <li key={i}>
                  {c.type === 'move' &&
                    `Move “${title(c.workout_id)?.title}” to ${c.to}. ${c.reason}`}
                  {c.type === 'skip' &&
                    `Skip “${title(c.workout_id)?.title}”: ${c.reason}`}
                  {c.type === 'missed' &&
                    `“${title(c.workout_id)?.title}” on ${title(c.workout_id)?.scheduled_on} was missed.`}
                </li>
              ))}
            </ul>
            <p className="muted">
              Missed volume is never piled onto later days.
            </p>
            <Button
              disabled={apply.isPending}
              onClick={() =>
                apply.mutate(proposals, {
                  onSuccess: () => toast.success('Plan updated.'),
                })
              }
            >
              Apply changes
            </Button>
          </div>
        )}
        <Button asChild variant="outline">
          <Link href="/app/training/plan">Build a race plan</Link>
        </Button>
      </Card>
      <Card>
        <h2>Your paces</h2>
        <p className="muted">
          From {q.data.paces.basis}. Estimates, not prescriptions.
        </p>
        <ul>
          <li>
            Easy {duration(z.easy[0])}–{duration(z.easy[1])} /km
          </li>
          <li>
            Marathon {duration(z.marathon[0])}–{duration(z.marathon[1])} /km
          </li>
          <li>
            Threshold {duration(z.threshold[0])}–{duration(z.threshold[1])} /km
          </li>
          <li>
            Interval {duration(z.interval[0])}–{duration(z.interval[1])} /km
          </li>
        </ul>
        <p className="muted">
          Equivalent times: 5 km {duration(q.data.paces.predictions['5k'])} · 10
          km {duration(q.data.paces.predictions['10k'])} · half{' '}
          {duration(q.data.paces.predictions.half)}
        </p>
      </Card>
    </div>
  );
}
