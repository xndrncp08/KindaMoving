'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, Skeleton } from '@km/ui';
import { explainQuery, type Observation } from '@/lib/queries';
import { duration } from '@/lib/metrics';
function fmt(o: Observation, v: number) {
  if (o.unit === 's/km') return duration(v) + ' /km';
  if (o.unit === 's') return duration(v);
  if (o.unit === 'CV') return (v * 100).toFixed(1) + '%';
  return (Math.round(v * 10) / 10).toString() + ' ' + o.unit;
}
function Group({
  title,
  note,
  items,
}: {
  title: string;
  note: string;
  items?: Observation[];
}) {
  if (!items?.length) return null;
  return (
    <div>
      <h3>{title}</h3>
      <p className="muted">{note}</p>
      <ul>
        {items.map((o) => (
          <li key={o.key}>
            <strong>{o.label}</strong>: {fmt(o, o.value)} vs typical{' '}
            {fmt(o, o.typical)}
            <span className="muted">
              {' '}
              (n={o.n}
              {o.robust_z !== null ? `, z=${o.robust_z}` : ''})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function WhyDifferent({
  userId,
  activityId,
}: {
  userId: string;
  activityId: string;
}) {
  const q = useQuery(explainQuery(userId, activityId));
  return (
    <Card>
      <h2>Why was this run different?</h2>
      {q.isPending ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState message={q.error.message} retry={() => void q.refetch()} />
      ) : q.data.status !== 'ok' ? (
        <p className="muted">{q.data.message}</p>
      ) : (
        <div className="stack">
          <p className="muted">
            Compared with {q.data.comparables?.length} similar runs from the
            past year
            {q.data.comparables?.some((c) => c.same_route)
              ? ', including runs on the same route'
              : ''}
            . Only differences that are both unusual for you and large enough to
            matter are listed.
          </p>
          {!q.data.measured?.length &&
            !q.data.modeled?.length &&
            !q.data.context?.length && (
              <p>
                Nothing stood out. This run was within your usual range on every
                recorded measure.
              </p>
            )}
          <Group
            title="Measured"
            note="Recorded by your device or derived directly from it."
            items={q.data.measured}
          />
          <Group
            title="Modeled estimates"
            note="Calculated with population models; approximate."
            items={q.data.modeled}
          />
          <Group
            title="Context"
            note="Weather (Open-Meteo model at the start hour) and your recent training."
            items={q.data.context}
          />
          {!!q.data.possible_explanations?.length && (
            <div>
              <h3>Possible explanations</h3>
              <p className="muted">
                Possibilities linked to the evidence above, not conclusions or
                medical advice.
              </p>
              <ul>
                {q.data.possible_explanations.map((e) => (
                  <li key={e.text}>{e.text}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>Comparable runs</summary>
            <ul>
              {q.data.comparables?.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/activities/compare?a=${activityId}&b=${c.id}`}
                  >
                    {c.title} · {c.start_time.slice(0, 10)}
                  </Link>
                  {c.same_route && <span className="badge">same route</span>}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Card>
  );
}
