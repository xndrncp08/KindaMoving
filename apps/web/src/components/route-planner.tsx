'use client';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, ErrorState, Input, Skeleton } from '@km/ui';
import { api, keys } from '@/lib/queries';
import { lineSlice } from '@/lib/geo';
import type { MapPoint } from './planner-map';
const PlannerMap = dynamic(() => import('./planner-map'), {
  ssr: false,
  loading: () => <Skeleton />,
});

export interface GeneratedRoute {
  geometry: { type: 'LineString'; coordinates: number[][] };
  metrics: {
    distance_m: number;
    climb_m: number;
    crossings: {
      lat: number;
      lon: number;
      class: 'major' | 'minor';
      signals: boolean;
      in_tempo: boolean;
    }[];
    elevation_coverage: number;
    [k: string]: unknown;
  };
  tempo: { start_m: number; distance_m: number } | null;
  score: number;
  score_parts: Record<string, number>;
  reasons: string[];
}
interface Result {
  status: 'ok' | 'infeasible';
  routes: GeneratedRoute[];
  conflicts?: string[];
  suggestions?: string[];
  hazards_considered?: number;
}
const form = z.object({
  distance_km: z.coerce.number().min(1).max(42.2),
  tolerance_pct: z.coerce.number().min(2).max(30),
  shape: z.enum(['loop', 'out_and_back']),
  tempo: z.boolean(),
  tempo_km: z.coerce.number().min(0.4).max(21),
  tempo_max_minor: z.coerce.number().int().min(0).max(20),
  allow_major: z.boolean(),
  elevation: z.enum(['any', 'flat', 'hilly']),
  surface: z.enum(['any', 'paved', 'unpaved']),
  prefer_lit: z.boolean(),
  avoid_conditions: z.boolean(),
});
type Form = z.infer<typeof form>;
const partNames: Record<string, string> = {
  distance: 'Distance error',
  crossings: 'Crossings',
  busy_roads: 'Beside major roads',
  overlap: 'Repeated sections',
  hazards: 'Reported conditions',
  climb: 'Climbing',
  tempo: 'Tempo section quality',
  surface: 'Surface mismatch',
  lighting: 'Unlit sections',
};

export function RoutePlanner({ userId }: { userId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  // Start point lives in the URL so a plan is shareable and survives reloads.
  const start =
    params.get('lat') && params.get('lon')
      ? { lat: Number(params.get('lat')), lon: Number(params.get('lon')) }
      : null;
  const [selected, setSelected] = useState(0);
  const { register, handleSubmit, watch, formState } = useForm<
    z.input<typeof form>,
    unknown,
    Form
  >({
    resolver: zodResolver(form),
    defaultValues: {
      distance_km: Number(params.get('km') ?? 10),
      tolerance_pct: 10,
      shape: 'loop',
      tempo: params.has('tempo'),
      tempo_km: Number(params.get('tempo') ?? 4),
      tempo_max_minor: 0,
      allow_major: false,
      elevation: 'flat',
      surface: 'any',
      prefer_lit: false,
      avoid_conditions: true,
    },
  });
  const setStart = (lat: number, lon: number) => {
    const next = new URLSearchParams(params);
    next.set('lat', lat.toFixed(5));
    next.set('lon', lon.toFixed(5));
    router.replace('?' + next.toString(), { scroll: false });
  };
  const generate = useMutation({
    mutationFn: (f: Form) =>
      api<Result>('routes/generate', {
        method: 'POST',
        body: JSON.stringify({
          lat: start!.lat,
          lon: start!.lon,
          distance_m: f.distance_km * 1000,
          tolerance: f.tolerance_pct / 100,
          shape: f.shape,
          tempo_m: f.tempo ? f.tempo_km * 1000 : null,
          tempo_max_major: f.allow_major ? 1 : 0,
          tempo_max_minor: f.tempo_max_minor,
          elevation: f.elevation,
          surface: f.surface,
          prefer_lit: f.prefer_lit,
          avoid_conditions: f.avoid_conditions,
        }),
      }),
    onSuccess: () => setSelected(0),
  });
  const save = useMutation({
    mutationFn: ({ route, title }: { route: GeneratedRoute; title: string }) =>
      api<{ id: string }>('routes/save', {
        method: 'POST',
        body: JSON.stringify({
          title,
          source: 'generated',
          geometry: route.geometry,
          waypoints: [],
          generation: {
            request: watch(),
            start,
            metrics: {
              ...route.metrics,
              crossings: route.metrics.crossings.length,
            },
            tempo: route.tempo,
            reasons: route.reasons,
            score: route.score,
            score_parts: route.score_parts,
          },
          validation: {
            network_coverage: 1,
            valid: true,
            method: 'generated on the mapped network',
          },
        }),
      }),
    onSuccess: ({ id }) => {
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'routes'),
      });
      toast.success('Route saved.');
      router.push('/app/routes/' + id);
    },
  });
  const routes = generate.data?.routes ?? [];
  const current = routes[selected];
  const highlight = useMemo(
    () =>
      current?.tempo
        ? lineSlice(
            current.geometry.coordinates,
            current.tempo.start_m,
            current.tempo.start_m + current.tempo.distance_m,
          )
        : null,
    [current],
  );
  const points: MapPoint[] = [
    ...(start ? [{ ...start, kind: 'start' as const }] : []),
    ...(current?.metrics.crossings.map((c) => ({
      lat: c.lat,
      lon: c.lon,
      kind: c.class,
    })) ?? []),
  ];
  const tempoOn = watch('tempo');
  return (
    <div className="planner">
      <Card>
        <form
          className="stack"
          onSubmit={handleSubmit((f) => {
            if (!start) {
              toast.error(
                'Pick a start point on the map or use your location.',
              );
              return;
            }
            generate.mutate(f);
          })}
        >
          <p className="muted">
            {start
              ? `Start ${start.lat.toFixed(4)}, ${start.lon.toFixed(4)}. Tap the map to move it.`
              : 'Tap the map to choose a start point.'}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              navigator.geolocation.getCurrentPosition(
                (p) => setStart(p.coords.latitude, p.coords.longitude),
                () => toast.error('Location unavailable. Tap the map instead.'),
                { enableHighAccuracy: true, timeout: 10000 },
              )
            }
          >
            Use my location
          </Button>
          <div className="row">
            <label>
              Distance (km)
              <Input type="number" step="0.1" {...register('distance_km')} />
            </label>
            <label>
              Tolerance (±%)
              <Input type="number" {...register('tolerance_pct')} />
            </label>
          </div>
          <label>
            Shape
            <select {...register('shape')} disabled={tempoOn}>
              <option value="loop">Loop</option>
              <option value="out_and_back">Out and back</option>
            </select>
          </label>
          <label>
            <input type="checkbox" {...register('tempo')} /> Include an
            uninterrupted tempo section
          </label>
          {tempoOn && (
            <div className="row">
              <label>
                Tempo (km)
                <Input type="number" step="0.1" {...register('tempo_km')} />
              </label>
              <label>
                Max minor crossings
                <Input type="number" {...register('tempo_max_minor')} />
              </label>
              <label>
                <input type="checkbox" {...register('allow_major')} /> Allow one
                major crossing
              </label>
            </div>
          )}
          <div className="row">
            <label>
              Elevation
              <select {...register('elevation')}>
                <option value="flat">Minimal climbing</option>
                <option value="any">No preference</option>
                <option value="hilly">Hills welcome</option>
              </select>
            </label>
            <label>
              Surface
              <select {...register('surface')}>
                <option value="any">Any</option>
                <option value="paved">Paved</option>
                <option value="unpaved">Trails / unpaved</option>
              </select>
            </label>
          </div>
          <label>
            <input type="checkbox" {...register('prefer_lit')} /> Prefer lit
            paths
          </label>
          <label>
            <input type="checkbox" {...register('avoid_conditions')} /> Avoid
            recently reported hazards
          </label>
          {Object.entries(formState.errors).map(([k, e]) => (
            <p key={k} className="field-error" role="alert">
              {k}: {String(e?.message)}
            </p>
          ))}
          <Button disabled={generate.isPending}>
            {generate.isPending ? 'Searching the network…' : 'Find routes'}
          </Button>
        </form>
        {generate.error && <ErrorState message={generate.error.message} />}
        {generate.data?.status === 'infeasible' && (
          <div className="stack" role="status">
            <h2>No route fits every constraint</h2>
            <ul>
              {generate.data.conflicts?.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <h3>Try</h3>
            <ul>
              {generate.data.suggestions?.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {routes.length > 0 && (
          <div className="stack">
            <h2>
              {routes.length} route{routes.length > 1 ? 's' : ''}
            </h2>
            {generate.data?.hazards_considered ? (
              <p className="muted">
                {generate.data.hazards_considered} reported condition(s) were
                weighed.
              </p>
            ) : null}
            {routes.map((r, i) => (
              <Card
                key={i}
                className="route-option"
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                <p className="eyebrow">
                  Option {i + 1} · score {r.score.toFixed(2)} (lower is better)
                </p>
                <ul>
                  {r.reasons.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <details>
                  <summary>Why this ranking?</summary>
                  <ul>
                    {Object.entries(r.score_parts).map(([k, v]) => (
                      <li key={k}>
                        {partNames[k] ?? k}: {v.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </details>
                {i === selected && (
                  <Button
                    type="button"
                    disabled={save.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      const title = prompt(
                        'Name this route',
                        `${(r.metrics.distance_m / 1000).toFixed(1)} km ${r.tempo ? 'tempo ' : ''}loop`,
                      );
                      if (title?.trim())
                        save.mutate({
                          route: r,
                          title: title.trim().slice(0, 120),
                        });
                    }}
                  >
                    Save route
                  </Button>
                )}
              </Card>
            ))}
            {save.error && <ErrorState message={save.error.message} />}
          </div>
        )}
      </Card>
      <PlannerMap
        lines={routes.map((r, i) => ({
          coordinates: r.geometry.coordinates,
          selected: i === selected,
        }))}
        highlight={highlight}
        points={points}
        onPick={setStart}
        fitKey={
          current
            ? `${generate.submittedAt}-${selected}`
            : start
              ? 'start'
              : undefined
        }
        label="Route planner map. Tap to set the start point."
      />
    </div>
  );
}
