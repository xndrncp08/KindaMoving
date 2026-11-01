'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, Skeleton, EmptyState, Provenance } from '@km/ui';
import { overviewQuery, profileQuery } from '@/lib/queries';
import { day, distance, duration, span } from '@/lib/metrics';
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
      <dl className="instrument" aria-label="Training summary">
        <div className="instrument-cell">
          <dt>
            <span className="eyebrow">Time on feet · 7 days</span>
            <Provenance kind="measured" />
          </dt>
          <dd className="metric num">{span(o.load.last7_s)}</dd>
          <dd className="muted">
            vs {span(o.load.weekly_avg28_s)} weekly average (28 days)
          </dd>
        </div>
        <div className="instrument-cell">
          <dt>
            <span className="eyebrow">Load trend</span>
            <Provenance kind="measured" />
          </dt>
          <dd className="metric num">
            {o.load.ratio === null ? '—' : o.load.ratio.toFixed(2) + '×'}
          </dd>
          <dd className="muted">
            7-day time over your 4-week average. A trend, not an injury
            predictor.
          </dd>
        </div>
        <div className="instrument-cell">
          <dt>
            <span className="eyebrow">Consistency</span>
            <Provenance kind="measured" />
          </dt>
          <dd className="metric num">
            {o.consistency.active_weeks}/{o.consistency.of_weeks} weeks
          </dd>
          <dd className="muted">
            {o.consistency.runs_per_week} runs per week ·{' '}
            {o.consistency.current_streak_weeks}-week streak
          </dd>
        </div>
        <div className="instrument-cell">
          <dt>
            <span className="eyebrow">Max heart rate</span>
            <Provenance kind="estimated" />
          </dt>
          <dd className="metric num">
            {o.hr_max_estimate ? `${o.hr_max_estimate} bpm` : '—'}
          </dd>
          <dd className="muted">
            Highest recorded value, used for zone load. A lab or field test is
            more accurate.
          </dd>
        </div>
      </dl>
      <Card>
        <div className="row between">
          <h2>Weekly volume</h2>
          <p className="legend">
            <span>
              <i style={{ background: 'var(--series-pace)' }} />
              Distance <Provenance kind="measured" />
            </span>
            <span>
              <i style={{ background: 'var(--series-hr)' }} />
              HR load, Edwards TRIMP (right axis){' '}
              <Provenance kind="estimated" />
            </span>
          </p>
        </div>
        <Weekly weekly={o.weekly} units={units} />
      </Card>
      <Card>
        <h2>Personal bests</h2>
        {o.personal_bests.length === 0 ? (
          <EmptyState title="No recorded efforts yet">
            Import a GPX/FIT file or sync COROS to find your fastest segments.
          </EmptyState>
        ) : (
          <dl className="instrument compact">
            {o.personal_bests.map((pb) => (
              <div className="instrument-cell" key={pb.effort}>
                <dt className="eyebrow">{names[pb.effort]}</dt>
                <dd className="metric num">{duration(pb.elapsed_s)}</dd>
                <dd suppressHydrationWarning>
                  <Link href={'/app/activities/' + pb.activity_id}>
                    {day(pb.date, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
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
