'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, ErrorState, Skeleton } from '@km/ui';
import { api, gearQuery, keys, type GearShoe } from '@/lib/queries';
import { day, duration } from '@/lib/metrics';
export function invalidateGear(
  client: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  for (const r of ['gear-analytics', 'summary', 'activities', 'shoes'])
    void client.invalidateQueries({ queryKey: keys.resource(userId, r) });
}
export function ShoeStats({ s }: { s: GearShoe }) {
  return (
    <>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(s.wear_fraction * 100)}
        aria-label={`${s.title} wear`}
        style={{ height: 8, borderRadius: 4, background: 'var(--line)' }}
      >
        <div
          style={{
            width: `${Math.min(100, s.wear_fraction * 100)}%`,
            height: '100%',
            borderRadius: 4,
            background:
              s.wear_fraction >= 1 ? 'var(--danger)' : 'var(--accent-ink)',
          }}
        />
      </div>
      <p className="muted">
        {(s.total_m / 1000).toFixed(0)} of {(s.target_m / 1000).toFixed(0)} km
        expected · {s.runs} runs
        {s.cost_per_km != null &&
          ` · ${s.cost_per_km.toFixed(2)} ${s.currency}/km`}
        {s.projected_target_on &&
          ` · reaches its expected lifespan around ${s.projected_target_on} at ${(s.weekly_rate_m / 1000).toFixed(0)} km/week`}
      </p>
    </>
  );
}
export function GearOverview({ userId }: { userId: string }) {
  const client = useQueryClient();
  const q = useQuery(gearQuery(userId));
  const [selected, setSelected] = useState<string[]>([]);
  const [shoe, setShoe] = useState('');
  const assign = useMutation({
    mutationFn: () =>
      api<{ updated: number }>('gear/assign', {
        method: 'POST',
        body: JSON.stringify({ activity_ids: selected, shoe_id: shoe }),
      }),
    onSuccess: (r) => {
      toast.success(`${r.updated} run(s) assigned.`);
      setSelected([]);
      invalidateGear(client, userId);
    },
  });
  if (q.isPending) return <Skeleton />;
  if (q.error)
    return (
      <ErrorState message={q.error.message} retry={() => void q.refetch()} />
    );
  const active = q.data.shoes.filter((s) => !s.retired);
  const rotationTotal = Object.values(q.data.rotation_30d).reduce(
    (a, b) => a + b,
    0,
  );
  return (
    <div className="stack">
      {rotationTotal > 0 && (
        <Card>
          <h2>Rotation, last 30 days</h2>
          <p>
            {q.data.shoes
              .filter((s) => q.data.rotation_30d[s.id])
              .map(
                (s) =>
                  `${s.title} ${Math.round((q.data.rotation_30d[s.id] / rotationTotal) * 100)}%`,
              )
              .join(' · ')}
          </p>
        </Card>
      )}
      {q.data.unassigned.length > 0 && (
        <Card>
          <h2>
            {q.data.unassigned.length} recent{' '}
            {q.data.unassigned.length === 1 ? 'run' : 'runs'} without shoes
          </h2>
          <p className="muted">
            Assign them so mileage stays accurate. Totals are recalculated from
            your runs, so nothing is double counted.
          </p>
          <ul>
            {q.data.unassigned.slice(0, 20).map((a) => (
              <li key={a.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(a.id)
                          ? s.filter((x) => x !== a.id)
                          : [...s, a.id],
                      )
                    }
                  />{' '}
                  <span suppressHydrationWarning>
                    {day(a.started_at, { month: 'short', day: 'numeric' })}
                  </span>{' '}
                  · {a.title} · {(a.distance_m / 1000).toFixed(1)} km
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <Button
              variant="ghost"
              onClick={() => setSelected(q.data.unassigned.map((a) => a.id))}
            >
              Select all
            </Button>
            <select
              value={shoe}
              onChange={(e) => setShoe(e.target.value)}
              aria-label="Shoe to assign"
            >
              <option value="">Choose shoes</option>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Button
              disabled={!shoe || !selected.length || assign.isPending}
              onClick={() => assign.mutate()}
            >
              Assign {selected.length || ''}
            </Button>
          </div>
          {assign.error && <ErrorState message={assign.error.message} />}
        </Card>
      )}
      <div className="grid two">
        {q.data.shoes.map((s) => (
          <Card key={s.id}>
            <p className="eyebrow">
              {s.retired
                ? `Retired${s.retired_on ? ' ' + s.retired_on : ''}`
                : 'In rotation'}
              {s.is_default && ' · default'}
            </p>
            <h2 style={{ fontSize: 22 }}>
              <Link href={'/app/gear/' + s.id}>{s.title} ↗</Link>
            </h2>
            <ShoeStats s={s} />
            {s.by_kind && (
              <p className="muted">
                {Object.entries(s.by_kind)
                  .map(
                    ([k, v]) =>
                      `${k}: ${(v.m / 1000).toFixed(0)} km${v.pace_s_per_km ? ` @ ${duration(v.pace_s_per_km)}/km` : ''}`,
                  )
                  .join(' · ')}
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
export function ShoeWear({
  userId,
  shoeId,
}: {
  userId: string;
  shoeId: string;
}) {
  const client = useQueryClient();
  const gear = useQuery(gearQuery(userId));
  const s = gear.data?.shoes.find((x) => x.id === shoeId);
  const wear = useQuery({
    queryKey: [...keys.resource(userId, 'gear-analytics'), 'wear', shoeId],
    queryFn: () =>
      api<
        {
          id: string;
          observed_on: string;
          rating: number | null;
          note: string;
        }[]
      >(`gear/${shoeId}/wear`),
  });
  const [rating, setRating] = useState('');
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api(`gear/${shoeId}/wear`, {
        method: 'POST',
        body: JSON.stringify({
          observed_on: new Date().toLocaleDateString('en-CA'),
          rating: rating ? Number(rating) : null,
          note,
        }),
      }),
    onSuccess: () => {
      setNote('');
      setRating('');
      void client.invalidateQueries({
        queryKey: [...keys.resource(userId, 'gear-analytics'), 'wear', shoeId],
      });
    },
  });
  if (!s) return null;
  return (
    <Card>
      <h2>Wear and history</h2>
      <ShoeStats s={s} />
      {s.monthly && (
        <p className="muted">
          Monthly:{' '}
          {s.monthly
            .map((m) => `${m.month} ${(m.m / 1000).toFixed(0)} km`)
            .join(' · ')}
        </p>
      )}
      {s.by_kind && (
        <ul>
          {Object.entries(s.by_kind).map(([k, v]) => (
            <li key={k}>
              {k}: {v.runs} runs, {(v.m / 1000).toFixed(1)} km
              {v.pace_s_per_km ? `, ${duration(v.pace_s_per_km)}/km` : ''}
              {v.avg_hr ? `, ${v.avg_hr} bpm` : ''}
            </li>
          ))}
        </ul>
      )}
      <h3>Wear notes</h3>
      <div className="row">
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          aria-label="Condition rating"
        >
          <option value="">Rating (optional)</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} — {['', 'worn out', 'tired', 'fine', 'good', 'like new'][r]}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="e.g. outsole worn at the heel"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          disabled={(!note.trim() && !rating) || add.isPending}
          onClick={() => add.mutate()}
        >
          Add
        </Button>
      </div>
      <ul>
        {wear.data?.map((w) => (
          <li key={w.id}>
            {w.observed_on}
            {w.rating ? ` · ${w.rating}/5` : ''} {w.note}
          </li>
        ))}
      </ul>
    </Card>
  );
}
