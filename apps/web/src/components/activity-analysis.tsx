'use client';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Activity, Split } from '@km/types';
import { Card, DataTable, Skeleton } from '@km/ui';
import { streamsQuery, api, keys } from '@/lib/queries';
import { distance, duration } from '@/lib/metrics';
import { chartSeries } from '@/lib/streams';
const Charts = dynamic(() => import('./activity-charts'), {
  ssr: false,
  loading: () => <Skeleton />,
});
const RouteMap = dynamic(() => import('./route-map'), {
  ssr: false,
  loading: () => <Skeleton />,
});
const effortNames: Record<string, string> = {
  '400m': '400 m',
  '1k': '1 km',
  '1mi': '1 mile',
  '5k': '5 km',
  '10k': '10 km',
  half: 'Half marathon',
  marathon: 'Marathon',
};
const paceText = (s: number | null | undefined, imperial: boolean) =>
  s
    ? duration(s * (imperial ? 1.609344 : 1)) + (imperial ? ' /mi' : ' /km')
    : '—';

/** Local wall-clock start in the activity's own UTC offset, independent of the viewer's zone. */
export function localStart(
  a: Pick<Activity, 'start_time' | 'utc_offset_s' | 'started_at'>,
) {
  if (!a.start_time) return a.started_at;
  const local = new Date(
    Date.parse(a.start_time) + (a.utc_offset_s ?? 0) * 1000,
  );
  const offset = (a.utc_offset_s ?? 0) / 3600;
  return (
    local.toISOString().slice(0, 16).replace('T', ' ') +
    ` (UTC${offset >= 0 ? '+' : ''}${offset})`
  );
}

export function ActivityAnalysis({
  activity: a,
  userId,
  units,
}: {
  activity: Activity;
  userId: string;
  units?: string;
}) {
  const imperial = units === 'imperial';
  const m = a.metrics ?? {};
  const imported = a.source && a.source !== 'manual';
  const streams = useQuery({
    ...streamsQuery(userId, a.id),
    enabled: !!imported,
  });
  const splits = useQuery({
    queryKey: [...keys.resource(userId, 'splits'), a.id],
    queryFn: () => api<(Split & { kind: string })[]>('activity-splits/' + a.id),
    enabled: !!imported,
  });
  const points = useMemo(
    () => (streams.data ? chartSeries(streams.data.data) : []),
    [streams.data],
  );
  if (!imported)
    return (
      <Card>
        <p className="muted">
          Manual entry · {a.started_at}. Upload the GPX/FIT file for this run,
          or connect COROS, to add splits, heart rate, elevation and analysis. A
          matching import upgrades this entry in place.
        </p>
      </Card>
    );
  const km = splits.data?.filter((s) => s.kind === 'km') ?? [];
  const laps = splits.data?.filter((s) => s.kind === 'lap') ?? [];
  return (
    <div className="stack">
      <div className="grid four">
        <Card>
          <p className="eyebrow">Distance</p>
          <p className="metric">{distance(a.distance_m, units)}</p>
          <p className="muted">
            {m.distance_source === 'device'
              ? 'Device distance'
              : 'Cleaned GPS distance'}
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Moving / elapsed</p>
          <p className="metric">{duration(a.moving_s ?? a.elapsed_s)}</p>
          <p className="muted">
            {duration(a.elapsed_s)} elapsed · {m.stoppage_count ?? 0} stops
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Moving pace</p>
          <p className="metric">{paceText(m.pace_s_per_km, imperial)}</p>
          <p className="muted">
            Grade-adjusted {paceText(m.grade_adjusted_pace_s_per_km, imperial)}{' '}
            (model)
          </p>
        </Card>
        <Card>
          <p className="eyebrow">Climb / heart rate</p>
          <p className="metric">{Math.round(a.elevation_gain_m ?? 0)} m</p>
          <p className="muted">
            {a.avg_hr
              ? `${Math.round(a.avg_hr)} avg · ${a.max_hr} max bpm`
              : 'No heart rate recorded'}
          </p>
        </Card>
      </div>
      <Card>
        <p className="muted">
          {a.source === 'coros' ? 'COROS' : 'File import'} · started{' '}
          {localStart(a)}
          {m.timezone_assumed && ' · time zone assumed from your browser'}
          {m.crosses_midnight && ' · crosses midnight'}
          {a.avg_cadence ? ` · ${Math.round(a.avg_cadence)} spm` : ''}
        </p>
        {m.classification && (
          <p>
            <span className="badge">
              Estimated type: {m.classification.kind.replace(/_/g, ' ')}
            </span>{' '}
            <span className="muted">{m.classification.basis}</span>
          </p>
        )}
        {m.split_type && (
          <p>
            {m.split_type.kind === 'even'
              ? 'Even split'
              : m.split_type.kind === 'negative'
                ? 'Negative split'
                : 'Positive split'}
            : second half {m.split_type.difference_pct > 0 ? '+' : ''}
            {m.split_type.difference_pct}% vs first half (moving time).
          </p>
        )}
        {m.decoupling && (
          <p>
            Aerobic decoupling {m.decoupling.decoupling_pct}% — heart rate rose{' '}
            {m.decoupling.decoupling_pct > 0 ? 'relative to' : 'less than'} pace
            in the second half. Interpret only for steady efforts.
          </p>
        )}
        {m.pace_cv != null && (
          <p className="muted">
            Km pace variability (CV): {(m.pace_cv * 100).toFixed(1)}%
          </p>
        )}
      </Card>
      {streams.isPending ? (
        <Skeleton />
      ) : (
        points.length > 0 && <Charts points={points} />
      )}
      {a.track && <RouteMap geometry={a.track} />}
      {km.length > 0 && (
        <DataTable
          headers={['Km', 'Distance', 'Moving', 'Pace', 'Avg HR', 'Climb']}
        >
          {km.map((s) => (
            <tr key={s.index}>
              <td>{s.index + 1}</td>
              <td>{distance(s.distance_m, units)}</td>
              <td>{duration(s.moving_s)}</td>
              <td>{paceText(s.moving_s / (s.distance_m / 1000), imperial)}</td>
              <td>{s.avg_hr ? Math.round(s.avg_hr) : '—'}</td>
              <td>
                {s.elevation_gain_m != null
                  ? Math.round(s.elevation_gain_m) + ' m'
                  : '—'}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {laps.length > 1 && (
        <DataTable headers={['Lap', 'Distance', 'Time', 'Pace', 'Avg HR']}>
          {laps.map((s) => (
            <tr key={s.index}>
              <td>{s.index + 1}</td>
              <td>{distance(s.distance_m, units)}</td>
              <td>{duration(s.elapsed_s)}</td>
              <td>
                {paceText(
                  s.moving_s ? s.moving_s / (s.distance_m / 1000) : null,
                  imperial,
                )}
              </td>
              <td>{s.avg_hr ? Math.round(s.avg_hr) : '—'}</td>
            </tr>
          ))}
        </DataTable>
      )}
      {m.best_efforts && Object.keys(m.best_efforts).length > 0 && (
        <Card>
          <h2>Best efforts in this run</h2>
          <div className="grid four">
            {Object.entries(m.best_efforts).map(([k, v]) => (
              <p key={k}>
                <span className="eyebrow">{effortNames[k] ?? k}</span>
                <br />
                {duration(v.elapsed_s)}
              </p>
            ))}
          </div>
        </Card>
      )}
      {(m.warnings?.length ?? 0) > 0 && (
        <Card>
          <h2>Data quality</h2>
          <ul>
            {m.warnings!.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
