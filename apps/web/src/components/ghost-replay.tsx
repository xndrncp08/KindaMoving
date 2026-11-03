'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DataTable, ErrorState, Input, Skeleton } from '@km/ui';
import { api, keys, recordsQuery } from '@/lib/queries';
import { day, duration } from '@/lib/metrics';
import { useGhostPlayback } from '@/lib/stores';
const PlannerMap = dynamic(() => import('./planner-map'), {
  ssr: false,
  loading: () => <Skeleton />,
});
const GapChart = dynamic(() => import('./gap-chart'), {
  ssr: false,
  loading: () => <Skeleton />,
});
interface Ghost {
  status: 'ok' | 'not_comparable';
  reasons?: string[];
  comparability?: Record<string, number | null>;
  reference_line?: { coordinates: number[][] };
  gaps?: { s: number; gap_s: number }[];
  splits?: { km: number; ref_s: number; ghost_s: number; delta_s: number }[];
  frames?: { t: number; ref: number[]; ghost: number[]; ahead_m: number }[];
  finish?: {
    ref_s: number | null;
    ghost_s: number | null;
    gap_s: number | null;
  };
  off_route?: { from_s: number; to_s: number; at_m: number }[];
  skipped?: { at_m: number; length_m: number }[];
  notes?: string[];
}
export function GhostReplay({
  userId,
  a,
  b,
}: {
  userId: string;
  a: string | null;
  b: string | null;
}) {
  const router = useRouter();
  const activities = useQuery(recordsQuery(userId, 'activities'));
  const runs = (activities.data ?? []).filter(
    (x) => x.source && x.source !== 'manual',
  );
  const q = useQuery({
    queryKey: [...keys.resource(userId, 'ghost'), a, b],
    queryFn: () => api<Ghost>(`ghost?a=${a}&b=${b}`),
    enabled: !!a && !!b && a !== b,
    staleTime: Infinity,
  });
  const { t, playing, speed, setT, setPlaying, setSpeed } = useGhostPlayback();
  const frames = q.data?.frames ?? [];
  const last = frames.at(-1)?.t ?? 0;
  useEffect(() => {
    setT(0);
    setPlaying(false);
  }, [a, b, setT, setPlaying]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const next = Math.min(
        last,
        useGhostPlayback.getState().t + ((now - prev) / 1000) * speed,
      );
      prev = now;
      setT(next);
      if (next >= last) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, last, setT, setPlaying]);
  const frame =
    frames[Math.min(frames.length - 1, Math.max(0, Math.round(t / 5)))];
  const lines = useMemo(
    () =>
      q.data?.reference_line
        ? [{ coordinates: q.data.reference_line.coordinates, selected: true }]
        : [],
    [q.data],
  );
  const pick = (key: 'a' | 'b', id: string) => {
    const p = new URLSearchParams({
      ...(a ? { a } : {}),
      ...(b ? { b } : {}),
      [key]: id,
    });
    router.replace('/app/ghost?' + p.toString());
  };
  const label = (id: string | null) => runs.find((r) => r.id === id);
  return (
    <div className="stack">
      <Card>
        <div className="row">
          <label>
            You (reference)
            <select value={a ?? ''} onChange={(e) => pick('a', e.target.value)}>
              <option value="">Choose a run</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {day(r.started_at, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  · {(r.distance_m / 1000).toFixed(1)} km
                </option>
              ))}
            </select>
          </label>
          <label>
            Ghost
            <select value={b ?? ''} onChange={(e) => pick('b', e.target.value)}>
              <option value="">Choose a run on the same route</option>
              {runs
                .filter((r) => r.id !== a)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {day(r.started_at, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {(r.distance_m / 1000).toFixed(1)} km
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="muted">
          A simulated replay of two recorded runs, aligned by position on the
          route. It is not live tracking.
        </p>
      </Card>
      {q.isFetching && <Skeleton />}
      {q.error && <ErrorState message={q.error.message} />}
      {q.data?.status === 'not_comparable' && (
        <Card>
          <h2>These runs can&apos;t be raced fairly</h2>
          <ul>
            {q.data.reasons?.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {a && b && (
            <Link href={`/app/activities/compare?a=${a}&b=${b}`}>
              Compare them by distance instead ↗
            </Link>
          )}
        </Card>
      )}
      {q.data?.status === 'ok' && frame && (
        <>
          <PlannerMap
            lines={lines}
            points={[
              { lon: frame.ghost[0], lat: frame.ghost[1], kind: 'ghost' },
              { lon: frame.ref[0], lat: frame.ref[1], kind: 'runner' },
            ]}
            fitKey={`${a}-${b}`}
            label="Ghost replay map: the dark dot is you, the grey dot is your ghost."
            legend={['route', 'runner', 'ghost']}
          />
          <Card>
            <div className="row ghost-controls">
              <Button onClick={() => setPlaying(!playing)}>
                {playing ? 'Pause' : t >= last ? 'Replay' : 'Play'}
              </Button>
              <label>
                Speed
                <select
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  {[10, 30, 60, 120].map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
              </label>
              <label className="scrub">
                {duration(t)} / {duration(last)}
                <Input
                  type="range"
                  min={0}
                  max={last}
                  step={5}
                  value={t}
                  onChange={(e) => {
                    setPlaying(false);
                    setT(Number(e.target.value));
                  }}
                />
              </label>
            </div>
            <p className="metric" aria-live="polite">
              {Math.abs(frame.ahead_m) < 5
                ? 'Level'
                : frame.ahead_m > 0
                  ? `${Math.round(frame.ahead_m)} m ahead`
                  : `${Math.round(-frame.ahead_m)} m behind`}
            </p>
            <p className="muted">
              {label(a) && day(label(a)!.started_at)} vs{' '}
              {label(b) && day(label(b)!.started_at)} · at the shared finish{' '}
              {q.data.finish?.gap_s == null
                ? '—'
                : q.data.finish.gap_s > 0
                  ? `you were ${duration(q.data.finish.gap_s)} faster`
                  : `your ghost was ${duration(-q.data.finish.gap_s)} faster`}{' '}
              ·{' '}
              {Math.round((q.data.comparability?.matched_fraction ?? 0) * 100)}%
              of the ghost matched to the route
            </p>
            {!!q.data.off_route?.length && (
              <p className="muted">
                The ghost left the route {q.data.off_route.length} time(s); its
                position is held there.
              </p>
            )}
            {q.data.skipped?.map((k) => (
              <p key={k.at_m} className="notice">
                Your ghost skipped {Math.round(k.length_m)} m of this route near{' '}
                {(k.at_m / 1000).toFixed(2)} km, so the gap after that point
                compares unequal distances.
              </p>
            ))}
          </Card>
          <Card>
            <h2>Time gap along the route</h2>
            <GapChart gaps={q.data.gaps ?? []} />
          </Card>
          {!!q.data.splits?.length && (
            <DataTable headers={['Km', 'You', 'Ghost', 'Difference']}>
              {q.data.splits.map((s) => (
                <tr key={s.km}>
                  <td>{s.km}</td>
                  <td>{duration(s.ref_s)}</td>
                  <td>{duration(s.ghost_s)}</td>
                  <td>
                    {s.delta_s > 0
                      ? `${duration(s.delta_s)} faster`
                      : s.delta_s < 0
                        ? `${duration(-s.delta_s)} slower`
                        : 'even'}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}
    </div>
  );
}
