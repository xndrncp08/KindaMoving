'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Metric,
  Card,
  ActivityCard,
  WorkoutCard,
  EmptyState,
  ErrorState,
  Skeleton,
  Button,
} from '@km/ui';
import { recordsQuery, profileQuery, summaryQuery } from '@/lib/queries';
import { distance } from '@/lib/metrics';
import { useDashboard } from '@/lib/stores';
const Chart = dynamic(() => import('./distance-chart'), {
  ssr: false,
  loading: () => <Skeleton />,
});
export function Dashboard({ userId }: { userId: string }) {
  const activities = useQuery(recordsQuery(userId, 'activities'));
  const shoes = useQuery(recordsQuery(userId, 'shoes'));
  const workouts = useQuery(recordsQuery(userId, 'workouts'));
  const profile = useQuery(profileQuery(userId));
  const summary = useQuery(summaryQuery(userId));
  const showGear = useDashboard((s) => s.showGear);
  const toggle = useDashboard((s) => s.toggleGear);
  if (activities.isPending || profile.isPending || summary.isPending)
    return <Skeleton />;
  const error =
    summary.error ||
    activities.error ||
    profile.error ||
    shoes.error ||
    workouts.error;
  if (error)
    return (
      <ErrorState
        message={error.message}
        retry={() => {
          void activities.refetch();
          void profile.refetch();
          void shoes.refetch();
          void workouts.refetch();
        }}
      />
    );
  const runs = activities.data || [];
  const weekly = summary.data?.weekly_distance_m || 0;
  const units = profile.data?.units;
  return (
    <div className="stack">
      <header className="page-head row between">
        <div>
          <p className="eyebrow">Your running, at a glance</p>
          <h1 className="page-title">
            Hey, {profile.data?.preferred_name || 'runner'}.
          </h1>
          <p className="muted">Showing up is a pretty good start.</p>
        </div>
        <Button asChild>
          <Link href="/app/activities">Log a run ↗</Link>
        </Button>
      </header>
      <div className="grid">
        <Metric
          label="This week · since Monday"
          value={distance(weekly, units)}
        />
        <Metric
          label="Logged distance"
          value={distance(summary.data?.distance_m || 0, units)}
        />
        <Metric label="Activity count" value={summary.data?.count || 0} />
      </div>
      <Card>
        <h2>Your weekly goal</h2>
        <p>
          {distance(weekly, units)} of{' '}
          {distance(profile.data?.weekly_distance_m || 0, units)}
        </p>
        <progress
          aria-label="Weekly distance goal"
          max={Math.max(profile.data?.weekly_distance_m || 0, 1)}
          value={weekly}
          style={{ width: '100%', accentColor: '#8ea62f' }}
        />
        <p className="muted">
          {profile.data?.goals || 'Set a personal goal in settings.'}
        </p>
        <Link href="/app/settings">Update your goals ↗</Link>
      </Card>
      {runs.length > 0 && (
        <Card>
          <h2>Recent distance</h2>
          <Chart activities={runs.slice(0, 10).reverse()} units={units} />
        </Card>
      )}
      <div className="grid two">
        <ActivityCard title="Recent activities">
          {runs.length ? (
            runs.slice(0, 5).map((a) => (
              <p key={a.id}>
                <Link href={'/app/activities/' + a.id}>{a.title} ↗</Link>
                <span className="muted">
                  {' '}
                  · {distance(a.distance_m, units)}
                </span>
              </p>
            ))
          ) : (
            <EmptyState title="Nothing logged. Yet.">
              Your first run belongs here.
            </EmptyState>
          )}
        </ActivityCard>
        <WorkoutCard title="Recent workouts">
          {workouts.data?.length ? (
            workouts.data.slice(0, 5).map((w) => (
              <p key={w.id}>
                <Link href={'/app/training/' + w.id}>
                  {w.completed ? '✓ ' : ''}
                  {w.title} ↗
                </Link>
                <span className="muted"> · {w.scheduled_on}</span>
              </p>
            ))
          ) : (
            <EmptyState title="A little room to plan.">
              Add a workout to shape your week.
            </EmptyState>
          )}
        </WorkoutCard>
      </div>
      <Button variant="outline" onClick={toggle}>
        {showGear ? 'Hide' : 'Show'} shoe mileage
      </Button>
      {showGear && (
        <Card>
          <h2>In your rotation</h2>
          {shoes.data?.length ? (
            shoes.data.map((s) => (
              <p key={s.id}>
                <Link href={'/app/gear/' + s.id}>{s.title} ↗</Link> ·{' '}
                {distance(summary.data?.shoes[s.id] || 0, units)}{' '}
                {s.retired ? '· Retired' : ''}
              </p>
            ))
          ) : (
            <p className="muted">
              Add your shoes in Gear. They’ve earned a mention.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
