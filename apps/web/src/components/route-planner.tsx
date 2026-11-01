'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronDown,
  Crosshair,
  Download,
  LocateFixed,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import { Button, ErrorState, Input, Skeleton } from '@km/ui';
import { api, conditionsQuery, keys } from '@/lib/queries';
import { lineSlice } from '@/lib/geo';
import { toGpx, gpxFilename } from '@/lib/gpx';
import { useMap } from '@/lib/stores';
import type { MapPoint } from './planner-map';
import { MapLegend } from './map-legend';
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
const fieldNames: Record<string, string> = {
  distance_km: 'Distance must be 1–42.2 km.',
  tolerance_pct: 'Tolerance must be 2–30%.',
  tempo_km: 'Tempo section must be 0.4–21 km.',
  tempo_max_minor: 'Minor crossings must be a whole number from 0 to 20.',
};
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
type Start = { lat: number; lon: number } | null;
const letter = (i: number) => String.fromCharCode(65 + i);
const kmText = (m: number) =>
  (m / 1000).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export function RoutePlanner({ userId }: { userId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const client = useQueryClient();
  // Start point lives in the URL so a plan is shareable and survives reloads.
  const lat = params.get('lat');
  const lon = params.get('lon');
  const start: Start = useMemo(
    () => (lat && lon ? { lat: Number(lat), lon: Number(lon) } : null),
    [lat, lon],
  );
  const [history, setHistory] = useState<{ past: Start[]; future: Start[] }>({
    past: [],
    future: [],
  });
  const [selected, setSelected] = useState(0);
  const [panel, setPanel] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const { register, handleSubmit, watch, formState, getValues } = useForm<
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
  const writeStart = useCallback(
    (s: Start) => {
      const next = new URLSearchParams(params);
      if (s) {
        next.set('lat', s.lat.toFixed(5));
        next.set('lon', s.lon.toFixed(5));
      } else {
        next.delete('lat');
        next.delete('lon');
      }
      router.replace('?' + next.toString(), { scroll: false });
    },
    [params, router],
  );
  const setStart = (lat: number, lon: number) => {
    setHistory((h) => ({ past: [...h.past, start].slice(-50), future: [] }));
    writeStart({ lat, lon });
  };
  const undo = useCallback(() => {
    if (!history.past.length) return;
    const prev = history.past.at(-1)!;
    setHistory((h) => ({
      past: h.past.slice(0, -1),
      future: [start, ...h.future],
    }));
    writeStart(prev);
  }, [history, start, writeStart]);
  const redo = useCallback(() => {
    if (!history.future.length) return;
    const next = history.future[0];
    setHistory((h) => ({
      past: [...h.past, start],
      future: h.future.slice(1),
    }));
    writeStart(next);
  }, [history, start, writeStart]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('input, select, textarea, [contenteditable]')
      )
        return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
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
    onSuccess: (r) => {
      setSelected(0);
      body.current?.scrollTo({ top: 0 });
      setSaved(false);
      if (r.routes[0])
        setName(
          `${kmText(r.routes[0].metrics.distance_m)} km ${r.routes[0].tempo ? 'tempo ' : ''}${getValues('shape') === 'loop' ? 'loop' : 'out and back'}`,
        );
    },
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
            request: getValues(),
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
      setSaved(true);
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'routes'),
      });
      toast.success('Route saved.');
      router.push('/app/routes/' + id);
    },
  });
  const routes = useMemo(() => generate.data?.routes ?? [], [generate.data]);
  const current = routes[selected];
  const unsaved = routes.length > 0 && !saved;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  const near = useQuery({
    ...conditionsQuery(userId, start?.lat ?? 0, start?.lon ?? 0),
    enabled: overlay && !!start,
  });
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
  const hazards = overlay
    ? (near.data?.assessments ?? []).filter(
        (a) => a.status === 'likely' || a.status === 'possible',
      )
    : [];
  const points: MapPoint[] = [
    ...hazards.map((a) => ({
      lat: a.lat,
      lon: a.lon,
      kind: 'hazard' as const,
    })),
    ...(current?.metrics.crossings.map((c) => ({
      lat: c.lat,
      lon: c.lon,
      kind: c.class,
    })) ?? []),
    ...(start ? [{ ...start, kind: 'start' as const }] : []),
  ];
  const lines = useMemo(
    () =>
      routes.map((r, i) => ({
        coordinates: r.geometry.coordinates,
        selected: i === selected,
      })),
    [routes, selected],
  );
  const exportGpx = () => {
    if (!current) return;
    const title = name.trim() || 'KindaMoving route';
    const blob = new Blob([toGpx(title, current.geometry.coordinates)], {
      type: 'application/gpx+xml',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = gpxFilename(title);
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // Read at fit time only (the map is client-only), so no hydration concern.
  const phone =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(max-width: 720px)').matches;
  const fitPadding = phone
    ? {
        top: 72,
        right: 24,
        left: 24,
        // sheet is 62% of the workspace (viewport minus header and tab bar)
        bottom: panel ? Math.round((window.innerHeight - 125) * 0.62) + 16 : 96,
      }
    : { top: 72, right: 72, bottom: 48, left: panel ? 448 : 48 };
  const tempoOn = watch('tempo');
  const errors = Object.entries(formState.errors);
  return (
    <div className="workspace">
      <div className="workspace-map">
        <PlannerMap
          lines={lines}
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
          label="Route planner map. Click or tap to set the start point, or use the start buttons in the panel."
          legend={false}
          fitPadding={fitPadding}
        />
      </div>
      <div className="map-tools" role="toolbar" aria-label="Map tools">
        <Button
          variant="outline"
          className="button-icon"
          aria-label="Undo start point (Command or Control Z)"
          disabled={!history.past.length}
          onClick={undo}
        >
          <Undo2 size={18} aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          className="button-icon"
          aria-label="Redo start point (Shift Command or Control Z)"
          disabled={!history.future.length}
          onClick={redo}
        >
          <Redo2 size={18} aria-hidden="true" />
        </Button>
        <label className="chip-toggle">
          <input
            type="checkbox"
            checked={overlay}
            onChange={(e) => setOverlay(e.target.checked)}
          />
          Conditions
          {overlay && start && near.data && (
            <span className="num muted">{hazards.length}</span>
          )}
        </label>
      </div>
      <section
        className="workspace-panel"
        data-open={panel}
        aria-labelledby="planner-title"
      >
        <button
          type="button"
          className="panel-handle"
          aria-expanded={panel}
          aria-controls="planner-body"
          onClick={() => setPanel(!panel)}
        >
          <span>
            <span className="eyebrow">KM Routes</span>
            <span id="planner-title" className="panel-title">
              {routes.length
                ? `${routes.length} candidate${routes.length > 1 ? 's' : ''}`
                : start
                  ? 'Set your workout'
                  : 'Choose a start point'}
            </span>
          </span>
          {panel ? (
            <ChevronDown size={20} aria-hidden="true" />
          ) : (
            <SlidersHorizontal size={20} aria-hidden="true" />
          )}
        </button>
        <div
          id="planner-body"
          ref={body}
          className="panel-body"
          hidden={!panel}
        >
          {routes.length > 0 && current && (
            <div className="stack candidates">
              <div
                className="segmented"
                role="group"
                aria-label="Candidate routes"
              >
                {routes.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={i === selected}
                    onClick={() => setSelected(i)}
                  >
                    {letter(i)}
                    <span className="num"> {kmText(r.metrics.distance_m)}</span>
                  </button>
                ))}
              </div>
              <dl className="stat-strip" aria-live="polite">
                <div>
                  <dt>Distance</dt>
                  <dd className="num">
                    {kmText(current.metrics.distance_m)}
                    <span className="unit">km</span>
                  </dd>
                </div>
                <div>
                  <dt>Climb</dt>
                  <dd className="num">
                    {current.metrics.elevation_coverage >= 0.9
                      ? Math.round(current.metrics.climb_m)
                      : '—'}
                    <span className="unit">m</span>
                  </dd>
                </div>
                <div>
                  <dt>Crossings</dt>
                  <dd className="num">{current.metrics.crossings.length}</dd>
                </div>
              </dl>
              {current.metrics.elevation_coverage < 0.9 && (
                <p className="notice warn">
                  Elevation covers only{' '}
                  {Math.round(current.metrics.elevation_coverage * 100)}% of
                  this route, so climbing is not assessed.
                </p>
              )}
              <ul className="reasons">
                {current.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <details>
                <summary>
                  Why {letter(selected)} ranks{' '}
                  {selected === 0 ? 'first' : `#${selected + 1}`}
                </summary>
                <p className="muted">
                  Score {current.score.toFixed(2)}; lower is better.
                </p>
                <ul className="num">
                  {Object.entries(current.score_parts).map(([k, v]) => (
                    <li key={k}>
                      {partNames[k] ?? k}: {v.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </details>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim())
                    save.mutate({
                      route: current,
                      title: name.trim().slice(0, 120),
                    });
                }}
              >
                <label>
                  Route name
                  <Input
                    name="route-name"
                    autoComplete="off"
                    maxLength={120}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="row">
                  <Button disabled={save.isPending}>
                    {save.isPending
                      ? 'Saving…'
                      : `Save Route ${letter(selected)}`}
                  </Button>
                  <Button type="button" variant="outline" onClick={exportGpx}>
                    <Download size={16} aria-hidden="true" />
                    GPX
                  </Button>
                </div>
              </form>
              {save.error && (
                <ErrorState
                  message={`${save.error.message} Your candidates are still here; try saving again.`}
                />
              )}
              <hr className="divider" />
            </div>
          )}
          <form
            className="stack"
            noValidate
            onSubmit={handleSubmit((f) => {
              if (!start) {
                toast.error(
                  'Choose a start point first: tap the map, use your location, or start at the map centre.',
                );
                return;
              }
              generate.mutate(f);
            })}
          >
            <div className="row start-row">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigator.geolocation.getCurrentPosition(
                    (p) => setStart(p.coords.latitude, p.coords.longitude),
                    () =>
                      toast.error(
                        'Location unavailable. Tap the map or start at the map centre instead.',
                      ),
                    { enableHighAccuracy: true, timeout: 10000 },
                  )
                }
              >
                <LocateFixed size={16} aria-hidden="true" />
                My Location
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const v = useMap.getState().viewport;
                  setStart(v.latitude, v.longitude);
                }}
              >
                <Crosshair size={16} aria-hidden="true" />
                Map Centre
              </Button>
            </div>
            <p className="muted num" aria-live="polite">
              {start
                ? `Start ${start.lat.toFixed(4)}, ${start.lon.toFixed(4)}`
                : 'No start point yet.'}
            </p>
            <div className="form-grid">
              <label>
                Distance (km)
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  autoComplete="off"
                  aria-invalid={!!formState.errors.distance_km}
                  {...register('distance_km')}
                />
              </label>
              <label>
                Tolerance (±%)
                <Input
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!!formState.errors.tolerance_pct}
                  {...register('tolerance_pct')}
                />
              </label>
              <label>
                Shape
                <select {...register('shape')} disabled={tempoOn}>
                  <option value="loop">Loop</option>
                  <option value="out_and_back">Out and back</option>
                </select>
              </label>
              <label>
                Elevation
                <select {...register('elevation')}>
                  <option value="flat">Minimal climbing</option>
                  <option value="any">No preference</option>
                  <option value="hilly">Hills welcome</option>
                </select>
              </label>
              <label className="full">
                Surface
                <select {...register('surface')}>
                  <option value="any">Any</option>
                  <option value="paved">Paved</option>
                  <option value="unpaved">Trails / unpaved</option>
                </select>
              </label>
            </div>
            <fieldset className="stack tight">
              <legend className="sr-only">Route preferences</legend>
              <label>
                <input type="checkbox" {...register('tempo')} />
                Uninterrupted tempo section
              </label>
              {tempoOn && (
                <div className="form-grid">
                  <label>
                    Tempo (km)
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      autoComplete="off"
                      aria-invalid={!!formState.errors.tempo_km}
                      {...register('tempo_km')}
                    />
                  </label>
                  <label>
                    Max minor crossings
                    <Input
                      type="number"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-invalid={!!formState.errors.tempo_max_minor}
                      {...register('tempo_max_minor')}
                    />
                  </label>
                  <label className="full">
                    <input type="checkbox" {...register('allow_major')} />
                    Allow one major crossing
                  </label>
                </div>
              )}
              <label>
                <input type="checkbox" {...register('prefer_lit')} />
                Prefer lit paths
              </label>
              <label>
                <input type="checkbox" {...register('avoid_conditions')} />
                Avoid recently reported hazards
              </label>
            </fieldset>
            {errors.length > 0 && (
              <div className="error" role="alert">
                {errors.map(([k]) => (
                  <p key={k}>{fieldNames[k] ?? 'Check this field.'}</p>
                ))}
              </div>
            )}
            <Button disabled={generate.isPending}>
              {generate.isPending
                ? 'Searching the Network…'
                : routes.length
                  ? 'Find New Routes'
                  : 'Find Routes'}
            </Button>
          </form>
          {generate.error && (
            <ErrorState
              message={`${generate.error.message} Your settings are kept; try again.`}
            />
          )}
          {generate.data?.status === 'infeasible' && (
            <div className="stack notice warn" role="status">
              <h2>No route fits every constraint</h2>
              <ul>
                {generate.data.conflicts?.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p>
                <strong>Try:</strong> {generate.data.suggestions?.join(' ')}
              </p>
            </div>
          )}
          <MapLegend className="panel-legend" />
          {generate.data?.hazards_considered ? (
            <p className="muted">
              {generate.data.hazards_considered} reported condition
              {generate.data.hazards_considered > 1 ? 's were' : ' was'}{' '}
              weighed.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
