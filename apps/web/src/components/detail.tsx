'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Activity, Resource } from '@km/types';
import { ActivityAnalysis } from './activity-analysis';
import { RouteDetail } from './route-detail';
import { cachedRecord } from '@/lib/offline/drafts';
import { WorkoutPanel } from './workout-panel';
import { ShoeWear } from './gear-overview';
import { Card, ErrorState, Skeleton, EmptyState } from '@km/ui';
import {
  recordsQuery,
  profileQuery,
  detailQuery,
  summaryQuery,
} from '@/lib/queries';
import { distance } from '@/lib/metrics';
import { RecordForm } from './record-form';
import { toast } from 'sonner';
export function Detail({
  name,
  id,
  userId,
}: {
  name: Resource;
  id: string;
  userId: string;
}) {
  const query = useQuery(detailQuery(userId, name, id));
  const offlineCopy = useQuery({
    queryKey: ['offline-copy', userId, name, id],
    queryFn: () => cachedRecord<Record<string, unknown>>(userId, `route:${id}`),
    enabled: name === 'routes' && !!query.error,
  });
  const summary = useQuery(summaryQuery(userId));
  const shoes = useQuery(recordsQuery(userId, 'shoes'));
  const activities = useQuery(recordsQuery(userId, 'activities'));
  const profile = useQuery(profileQuery(userId));
  if (query.isPending) return <Skeleton />;
  if (query.error && name === 'routes' && offlineCopy.data)
    return (
      <div className="stack">
        <p className="notice">
          Offline copy saved{' '}
          {new Date(offlineCopy.data.saved_at).toLocaleString()}. Editing needs
          a connection.
        </p>
        <h1 className="page-title">{String(offlineCopy.data.value.title)}</h1>
        <RouteDetail
          route={
            offlineCopy.data.value as unknown as Parameters<
              typeof RouteDetail
            >[0]['route']
          }
          userId={userId}
        />
      </div>
    );
  if (query.error) return <ErrorState message={query.error.message} />;
  const record = query.data;
  if (!record)
    return (
      <EmptyState title="Record not found">
        It may have been deleted, or belongs to another account.
      </EmptyState>
    );
  const r = record as unknown as Record<string, unknown>;
  return (
    <div className="stack">
      <Link
        href={
          '/app/' +
          {
            shoes: 'gear',
            workouts: 'training',
            activities: 'activities',
            routes: 'routes',
          }[name]
        }
      >
        ← Back to your records
      </Link>
      <h1 className="page-title">{String(r.title)}</h1>
      {name === 'activities' && (
        <ActivityAnalysis
          activity={record as Activity}
          userId={userId}
          units={profile.data?.units}
        />
      )}
      {name === 'routes' && (
        <RouteDetail
          route={
            record as unknown as Parameters<typeof RouteDetail>[0]['route']
          }
          userId={userId}
        />
      )}
      {name === 'workouts' && (
        <WorkoutPanel
          workout={
            record as unknown as Parameters<typeof WorkoutPanel>[0]['workout']
          }
          userId={userId}
        />
      )}
      {name === 'shoes' && <ShoeWear userId={userId} shoeId={id} />}
      {name === 'shoes' && (
        <Card>
          <h2>Shoe history</h2>
          <p className="metric">
            {summary.data
              ? distance(summary.data.shoes[id] || 0, profile.data?.units)
              : '—'}
          </p>
          <p className="muted">
            Includes{' '}
            {distance(Number(r.initial_distance_m), profile.data?.units)}{' '}
            recorded before KindaMoving.
          </p>
          {activities.data
            ?.filter((a) => a.shoe_id === id)
            .map((a) => (
              <p key={a.id}>
                <Link href={'/app/activities/' + a.id}>
                  {a.started_at} · {a.title} ·{' '}
                  {distance(a.distance_m, profile.data?.units)}
                </Link>
              </p>
            ))}
        </Card>
      )}
      <Card>
        <h2>Edit details</h2>
        <RecordForm
          name={name}
          userId={userId}
          record={r}
          shoes={shoes.data || []}
          onSaved={() => toast.success('Details updated.')}
        />
      </Card>
    </div>
  );
}
