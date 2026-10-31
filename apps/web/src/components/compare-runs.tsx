'use client';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { Activity, Split } from '@km/types';
import { Card, DataTable, EmptyState, ErrorState, Skeleton } from '@km/ui';
import { api, detailQuery, keys, profileQuery } from '@/lib/queries';
import { distance, duration } from '@/lib/metrics';
type Row = [
  string,
  (a: Activity) => number | null | undefined,
  (v: number) => string,
  boolean,
];
const rows: Row[] = [
  [
    'Distance',
    (a) => a.distance_m,
    (v) => (v / 1000).toFixed(2) + ' km',
    false,
  ],
  ['Moving time', (a) => a.moving_s ?? a.elapsed_s, duration, true],
  [
    'Moving pace',
    (a) =>
      a.metrics?.pace_s_per_km ??
      (a.moving_s ?? a.elapsed_s) / (a.distance_m / 1000),
    (v) => duration(v) + ' /km',
    true,
  ],
  [
    'Grade-adjusted pace (model)',
    (a) => a.metrics?.grade_adjusted_pace_s_per_km,
    (v) => duration(v) + ' /km',
    true,
  ],
  ['Climb', (a) => a.elevation_gain_m, (v) => Math.round(v) + ' m', false],
  ['Average HR', (a) => a.avg_hr, (v) => Math.round(v) + ' bpm', false],
  ['Time stopped', (a) => a.metrics?.stopped_s, duration, false],
];
/** Two runs side by side; identity comes from the URL (?a=&b=) so comparisons are shareable/bookmarkable. */
export function CompareRuns({
  userId,
  a,
  b,
}: {
  userId: string;
  a: string;
  b: string;
}) {
  const profile = useQuery(profileQuery(userId));
  const [ra, rb] = useQueries({
    queries: [
      detailQuery(userId, 'activities', a),
      detailQuery(userId, 'activities', b),
    ],
  });
  const [sa, sb] = useQueries({
    queries: [a, b].map((id) => ({
      queryKey: [...keys.resource(userId, 'splits'), id],
      queryFn: () => api<(Split & { kind: string })[]>('activity-splits/' + id),
    })),
  });
  if (ra.isPending || rb.isPending) return <Skeleton />;
  if (ra.error || rb.error)
    return <ErrorState message={(ra.error ?? rb.error)!.message} />;
  const A = ra.data as Activity;
  const B = rb.data as Activity;
  const kmA = sa.data?.filter((s) => s.kind === 'km') ?? [];
  const kmB = sb.data?.filter((s) => s.kind === 'km') ?? [];
  const n = Math.min(kmA.length, kmB.length);
  return (
    <div className="stack">
      <DataTable
        headers={[
          '',
          A.title + ' · ' + A.started_at,
          B.title + ' · ' + B.started_at,
          'Difference',
        ]}
      >
        {rows.map(([label, get, fmt, time]) => {
          const x = get(A);
          const y = get(B);
          const d = x != null && y != null ? x - y : null;
          return (
            <tr key={label}>
              <td>{label}</td>
              <td>{x != null ? fmt(x) : '—'}</td>
              <td>{y != null ? fmt(y) : '—'}</td>
              <td>
                {d === null
                  ? '—'
                  : (d > 0 ? '+' : d < 0 ? '−' : '') +
                    (time
                      ? duration(Math.abs(d))
                      : fmt(Math.abs(d)).replace(/^-/, ''))}
              </td>
            </tr>
          );
        })}
      </DataTable>
      <Card>
        <h2>Kilometre by kilometre</h2>
        {n === 0 ? (
          <EmptyState title="No splits to compare">
            Both runs need recorded detail (file import or COROS).
          </EmptyState>
        ) : (
          <DataTable
            headers={['Km', 'Pace A', 'Pace B', 'A vs B', 'HR A', 'HR B']}
          >
            {Array.from({ length: n }, (_, i) => {
              const pa = kmA[i].moving_s / (kmA[i].distance_m / 1000);
              const pb = kmB[i].moving_s / (kmB[i].distance_m / 1000);
              const d = pa - pb;
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{duration(pa)}</td>
                  <td>{duration(pb)}</td>
                  <td>
                    {(d > 0 ? '+' : d < 0 ? '−' : '') + duration(Math.abs(d))}
                  </td>
                  <td>{kmA[i].avg_hr ? Math.round(kmA[i].avg_hr!) : '—'}</td>
                  <td>{kmB[i].avg_hr ? Math.round(kmB[i].avg_hr!) : '—'}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <p className="muted">
          Splits align by distance from each start, not by position. For
          same-route position matching, use{' '}
          <Link href={`/app/ghost?a=${a}&b=${b}`}>Ghost replay</Link>. Distances
          shown in {distance(0, profile.data?.units).split(' ')[1]}.
        </p>
      </Card>
    </div>
  );
}
