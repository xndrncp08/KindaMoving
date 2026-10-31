'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, Skeleton, EmptyState } from '@km/ui';
import { overviewQuery, profileQuery } from '@/lib/queries';
import { distance, duration } from '@/lib/metrics';
const Weekly = dynamic(() => import('./weekly-chart'), {
  ssr: false,
  loading: () => <Skeleton />,
});
const names: Record<string, string> = {
  '400m': '400 m',
  '1k': '1 km',
  '1mi': '1 mile',
  '5k': '5 km',
  '10k': '10 km',
  half: 'Half',
  marathon: 'Marathon',
};
export function AnalyticsOverview({ userId }: { userId: string }) {
  const q = useQuery(overviewQuery(userId));
  const profile = useQuery(profileQuery(userId));
  if (q.isPending) return <Skeleton />;
  if (q.error)
    return (
      <ErrorState message={q.error.message} retry={() => void q.refetch()} />
    );
  const o = q.data;
  const units = profile.data?.units;
  return (
    <div className="stack">
      <div className="grid four">
        <Card>
          <p className="eyebrow">Last 7 days</p>
          <p className="metric">{duration(o.load.last7_s)}</p>
          <p className="muted">
            vs {duration(o.load.weekly_avg28_s)} weekly average over 28 days
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Load trend</p>
          <p className="metric">
            {o.load.ratio === null ? '—' : o.load.ratio.toFixed(2) + '×'}
          </p>
          <p className="muted">
            7-day time relative to your 4-week average. A trend, not an injury
            predictor.
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Consistency</p>
          <p className="metric">
            {o.consistency.active_weeks}/{o.consistency.of_weeks} weeks
          </p>
          <p className="muted">
            {o.consistency.runs_per_week} runs/week ·{' '}
            {o.consistency.current_streak_weeks}-week streak
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Highest recorded HR</p>
          <p className="metric">{o.hr_max_estimate ?? '—'}</p>
          <p className="muted">
            Used as max HR for zone load. A lab or field test is more accurate.
          </p>
        </Card>
      </div>
      <Card>
        <h2>Weekly volume</h2>
        <Weekly weekly={o.weekly} units={units} />
      </Card>
      <Card>
        <h2>Personal bests</h2>
        {o.personal_bests.length === 0 ? (
          <EmptyState title="No recorded efforts yet">
            Import a GPX/FIT file or sync COROS to find your fastest segments.
          </EmptyState>
        ) : (
          <div className="grid four">
            {o.personal_bests.map((pb) => (
              <p key={pb.effort}>
                <span className="eyebrow">{names[pb.effort]}</span>
                <br />
                <strong>{duration(pb.elapsed_s)}</strong>
                <br />
                <Link href={'/app/activities/' + pb.activity_id}>
                  {pb.title} · {pb.date}
                </Link>
              </p>
            ))}
          </div>
        )}
        <p className="muted">
          Fastest segment within any recorded run (elapsed time, stops before
          the segment excluded). Distances use{' '}
          {distance(1000, units).endsWith('km') ? 'kilometres' : 'miles'} for
          display only.
        </p>
      </Card>
    </div>
  );
}
