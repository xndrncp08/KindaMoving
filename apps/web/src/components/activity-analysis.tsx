'use client';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Activity, Split } from '@km/types';
import {
  Card,
  Provenance,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ProvenanceKind,
} from '@km/ui';
import { streamsQuery, api, keys } from '@/lib/queries';
import { distance, duration } from '@/lib/metrics';
import { chartSeries, type ChartPoint } from '@/lib/streams';
import type { MapPoint } from './planner-map';
import { WhyDifferent } from './why-different';
const Charts = dynamic(() => import('./activity-charts'), {
  ssr: false,
  loading: () => <Skeleton />,
});
const RunMap = dynamic(() => import('./planner-map'), {
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
  const [cursor, setCursor] = useState<ChartPoint | null>(null);
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
  const lines = useMemo(
    () =>
      a.track ? [{ coordinates: a.track.coordinates, selected: true }] : [],
    [a.track],
  );
  const marker: MapPoint[] =
    cursor?.lat != null && cursor.lon != null
      ? [{ lat: cursor.lat, lon: cursor.lon, kind: 'runner' }]
      : [];
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
  const avgPace = m.pace_s_per_km ?? null;
  const stat = (
    label: string,
    value: React.ReactNode,
    kind: ProvenanceKind,
    detail?: React.ReactNode,
  ) => (
    <div className="instrument-cell">
      <dt>
        <span className="eyebrow">{label}</span>
        <Provenance kind={kind} />
      </dt>
      <dd className="metric num">{value}</dd>
      {detail && <dd className="muted">{detail}</dd>}
    </div>
  );
  const splitRows = (rows: typeof km, time: 'moving_s' | 'elapsed_s') => {
    const paces = rows.map((s) =>
      s[time] && s.distance_m > 0 ? s[time]! / (s.distance_m / 1000) : null,
    );
    const ref = avgPace ?? paces.find((x) => x != null) ?? 1;
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{time === 'moving_s' ? 'Km' : 'Lap'}</th>
              <th className="n hide-sm">Distance</th>
              <th className="n hide-sm">Time</th>
              <th className="n">Pace</th>
              <th className="splitbar-col">
                <span className="sr-only">Pace </span>vs average
              </th>
              <th className="n">Avg HR</th>
              <th className="n hide-sm">Climb</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const p = paces[i];
              // Positive = faster than this run's average pace; ±15% fills the half-bar.
              const delta = p ? (ref - p) / ref : 0;
              const w = Math.min(Math.abs(delta) / 0.15, 1) * 50;
              return (
                <tr key={s.index}>
                  <td className="num">{s.index + 1}</td>
                  <td className="n hide-sm">{distance(s.distance_m, units)}</td>
                  <td className="n hide-sm">{duration(s[time] ?? 0)}</td>
                  <td className="n">{paceText(p, imperial)}</td>
                  <td className="splitbar-col">
                    <span
                      className="splitbar"
                      title={`${delta >= 0 ? 'Faster' : 'Slower'} than average by ${Math.abs(delta * 100).toFixed(1)}%`}
                    >
                      <i
                        className={delta >= 0 ? 'fast' : 'slow'}
                        style={{
                          width: `${w}%`,
                          left: delta >= 0 ? '50%' : `${50 - w}%`,
                        }}
                      />
                    </span>
                    <span className="num splitbar-label">
                      {delta >= 0 ? '−' : '+'}
                      {Math.abs(delta * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="n">{s.avg_hr ? Math.round(s.avg_hr) : '—'}</td>
                  <td className="n hide-sm">
                    {s.elevation_gain_m != null
                      ? Math.round(s.elevation_gain_m) + ' m'
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div className="stack analysis">
      <p className="run-meta muted">
        {a.source === 'coros' ? 'COROS' : 'File import'} · started{' '}
        <span className="num">{localStart(a)}</span>
        {m.timezone_assumed && ' · time zone assumed from your browser'}
        {m.crosses_midnight && ' · crosses midnight'}
      </p>
      <dl className="instrument" aria-label="Run summary">
        {stat(
          'Distance',
          distance(a.distance_m, units),
          'measured',
          m.distance_source === 'device' ? 'Device distance' : 'Cleaned GPS',
        )}
        {stat(
          'Moving time',
          duration(a.moving_s ?? a.elapsed_s),
          'measured',
          `${duration(a.elapsed_s)} elapsed · ${m.stoppage_count ?? 0} stops`,
        )}
        {stat(
          'Pace',
          paceText(m.pace_s_per_km, imperial),
          'measured',
          a.avg_cadence
            ? `Moving average · ${Math.round(a.avg_cadence)} spm`
            : 'Moving average',
        )}
        {stat(
          'Grade-adjusted',
          paceText(m.grade_adjusted_pace_s_per_km, imperial),
          'estimated',
          'Flat-equivalent model',
        )}
        {stat(
          'Climb',
          `${Math.round(a.elevation_gain_m ?? 0)} m`,
          'measured',
          a.elevation_loss_m != null
            ? `${Math.round(a.elevation_loss_m)} m descent`
            : undefined,
        )}
        {stat(
          'Heart rate',
          a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : '—',
          'measured',
          a.avg_hr ? `${a.max_hr} max` : 'No sensor data',
        )}
      </dl>
      <section className="insights" aria-label="How this run was run">
        {m.classification && (
          <div>
            <p className="eyebrow">
              Run type <Provenance kind="inferred" />
            </p>
            <p className="insight-value">
              {m.classification.kind.replace(/_/g, ' ')}
            </p>
            <p className="muted">{m.classification.basis}</p>
          </div>
        )}
        {m.split_type && (
          <div>
            <p className="eyebrow">
              Split <Provenance kind="measured" />
            </p>
            <p className="insight-value">
              {m.split_type.kind === 'even'
                ? 'Even'
                : m.split_type.kind === 'negative'
                  ? 'Negative'
                  : 'Positive'}
            </p>
            <p className="muted num">
              Second half {m.split_type.difference_pct > 0 ? '+' : ''}
              {m.split_type.difference_pct}% vs first (moving time)
            </p>
          </div>
        )}
        {m.decoupling && (
          <div>
            <p className="eyebrow">
              Aerobic decoupling <Provenance kind="measured" />
            </p>
            <p className="insight-value num">{m.decoupling.decoupling_pct}%</p>
            <p className="muted">
              Heart rate rose{' '}
              {m.decoupling.decoupling_pct > 0 ? 'relative to' : 'less than'}{' '}
              pace in the second half. Meaningful for steady efforts only.
            </p>
          </div>
        )}
        {m.pace_cv != null && (
          <div>
            <p className="eyebrow">
              Pace variability <Provenance kind="measured" />
            </p>
            <p className="insight-value num">{(m.pace_cv * 100).toFixed(1)}%</p>
            <p className="muted">Coefficient of variation across km splits</p>
          </div>
        )}
      </section>
      <div className="run-panels">
        <section aria-labelledby="streams-title" className="card">
          <h2 id="streams-title">Streams</h2>
          {streams.isPending ? (
            <Skeleton />
          ) : points.length > 0 ? (
            <Charts points={points} imperial={imperial} onCursor={setCursor} />
          ) : (
            <p className="muted">No time-series data in this file.</p>
          )}
          <p className="muted cursor-readout num" aria-live="off">
            {cursor
              ? `${cursor.km.toFixed(2)} km · ${paceText(cursor.pace, imperial)}${cursor.hr ? ` · ${cursor.hr} bpm` : ''}${cursor.ele != null ? ` · ${Math.round(cursor.ele)} m` : ''}`
              : 'Hover or touch a chart to trace the run on the map.'}
          </p>
        </section>
        {a.track && (
          <section aria-labelledby="map-title" className="run-map">
            <h2 id="map-title" className="sr-only">
              Route map
            </h2>
            <RunMap
              lines={lines}
              points={marker}
              fitKey={a.id}
              legend={false}
              label="Map of this run. The dot follows the chart cursor."
            />
          </section>
        )}
      </div>
      {(km.length > 0 || laps.length > 1) && (
        <section aria-labelledby="splits-title" className="stack">
          <h2 id="splits-title">Splits</h2>
          <Tabs defaultValue={km.length ? 'km' : 'laps'}>
            {km.length > 0 && laps.length > 1 && (
              <TabsList className="tabs" aria-label="Split type">
                <TabsTrigger value="km">Per km</TabsTrigger>
                <TabsTrigger value="laps">Device laps</TabsTrigger>
              </TabsList>
            )}
            {km.length > 0 && (
              <TabsContent value="km">{splitRows(km, 'moving_s')}</TabsContent>
            )}
            {laps.length > 1 && (
              <TabsContent value="laps">
                {splitRows(laps, 'elapsed_s')}
              </TabsContent>
            )}
          </Tabs>
        </section>
      )}
      {m.best_efforts && Object.keys(m.best_efforts).length > 0 && (
        <section aria-labelledby="efforts-title" className="stack">
          <h2 id="efforts-title">Best efforts in this run</h2>
          <dl className="instrument compact">
            {Object.entries(m.best_efforts).map(([k, v]) => (
              <div className="instrument-cell" key={k}>
                <dt className="eyebrow">{effortNames[k] ?? k}</dt>
                <dd className="metric num">{duration(v.elapsed_s)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <WhyDifferent userId={userId} activityId={a.id} />
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
