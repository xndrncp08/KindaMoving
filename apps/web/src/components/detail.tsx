'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Resource } from '@km/types';
import { Card, ErrorState, Skeleton, EmptyState } from '@km/ui';
import {
  recordsQuery,
  profileQuery,
  detailQuery,
  summaryQuery,
} from '@/lib/queries';
import { distance, duration, pace } from '@/lib/metrics';
import { RecordForm } from './record-form';
import { toast } from 'sonner';
const RouteMap = dynamic(() => import('./route-map'), {
  ssr: false,
  loading: () => <Skeleton />,
});
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
  const summary = useQuery(summaryQuery(userId));
  const shoes = useQuery(recordsQuery(userId, 'shoes'));
  const activities = useQuery(recordsQuery(userId, 'activities'));
  const profile = useQuery(profileQuery(userId));
  if (query.isPending) return <Skeleton />;
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
        <Card>
          <p>
            {distance(Number(r.distance_m), profile.data?.units)} ·{' '}
            {duration(Number(r.elapsed_s))} ·{' '}
            {duration(
              (pace(Number(r.distance_m), Number(r.elapsed_s)) || 0) *
                (profile.data?.units === 'imperial' ? 1.609344 : 1),
            )}{' '}
            /{profile.data?.units === 'imperial' ? 'mi' : 'km'}
          </p>
          <p className="muted">Manual activity · {String(r.started_at)}</p>
        </Card>
      )}
      {name === 'routes' && <RouteMap geometry={r.path} />}
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
