'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, Dialog, ErrorState, Skeleton } from '@km/ui';
import { api, keys, routeConditionsQuery } from '@/lib/queries';
import { AssessmentCard } from './conditions-view';
import { lineSlice } from '@/lib/geo';
import { useRouteEditor } from '@/lib/stores';
import { useUnsaved } from './unsaved';
import type { MapPoint } from './planner-map';
const PlannerMap = dynamic(() => import('./planner-map'), {
  ssr: false,
  loading: () => <Skeleton />,
});

interface RouteRecord {
  id: string;
  title: string;
  description: string;
  distance_m: number;
  path: { type: 'LineString'; coordinates: number[][] } | null;
  source?: string;
  waypoints?: { lat: number; lon: number }[];
  generation?: {
    reasons?: string[];
    tempo?: { start_m: number; distance_m: number } | null;
    score_parts?: Record<string, number>;
  } | null;
  validation?: {
    valid?: boolean;
    network_coverage?: number;
    issues?: { message: string }[];
  } | null;
  updated_at?: string;
}
interface Snap {
  status: 'ok' | 'error';
  message?: string;
  geometry?: { type: 'LineString'; coordinates: number[][] };
  metrics?: {
    distance_m: number;
    crossings: { lat: number; lon: number; class: 'major' | 'minor' }[];
  };
}

export function RouteDetail({
  route,
  userId,
}: {
  route: RouteRecord;
  userId: string;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmCoros, setConfirmCoros] = useState(false);
  const editor = useRouteEditor();
  useUnsaved(editing && editor.dirty);
  // Snap results are keyed by the waypoint list: a slow response for an older list can
  // never overwrite a newer one, and superseded requests are aborted via the signal.
  const snap = useQuery({
    queryKey: [
      ...keys.resource(userId, 'route-snap'),
      JSON.stringify(editor.waypoints),
    ],
    queryFn: ({ signal }) =>
      api<Snap>('routes/snap', {
        method: 'POST',
        body: JSON.stringify({ waypoints: editor.waypoints }),
        signal,
      }),
    enabled: editing && editor.waypoints.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: () =>
      api('routes/save', {
        method: 'POST',
        body: JSON.stringify({
          id: route.id,
          title: route.title,
          source: 'drawn',
          geometry: snap.data!.geometry,
          waypoints: editor.waypoints,
          generation: null,
          validation: {
            valid: true,
            network_coverage: 1,
            method: 'snapped to the mapped network',
          },
        }),
      }),
    onSuccess: () => {
      editor.setDirty(false);
      setEditing(false);
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'routes'),
      });
      toast.success('Route updated.');
    },
  });
  const conditions = useQuery({
    ...routeConditionsQuery(userId, route.id),
    enabled: !!route.path && !editing,
  });
  const coros = useMutation({
    mutationFn: () =>
      api('routes/' + route.id + '/coros', {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: () => {
      setConfirmCoros(false);
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'jobs'),
      });
      toast.success(
        'Sending to COROS. It appears in the COROS app Routes list within a few minutes.',
      );
    },
  });
  useEffect(() => {
    if (!editing) return;
    const start = route.waypoints?.length
      ? route.waypoints
      : route.path
        ? [route.path.coordinates[0], route.path.coordinates.at(-1)!].map(
            ([lon, lat]) => ({ lat, lon }),
          )
        : [];
    editor.begin(route.id, start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, route.id]);

  const shown =
    editing && snap.data?.geometry
      ? snap.data.geometry.coordinates
      : route.path?.coordinates;
  const tempo = route.generation?.tempo;
  const highlight = useMemo(
    () =>
      !editing && tempo && route.path
        ? lineSlice(
            route.path.coordinates,
            tempo.start_m,
            tempo.start_m + tempo.distance_m,
          )
        : null,
    [editing, tempo, route.path],
  );
  const points: MapPoint[] = editing
    ? [
        ...editor.waypoints.map((w) => ({ ...w, kind: 'waypoint' as const })),
        ...(snap.data?.metrics?.crossings.map((c) => ({
          lat: c.lat,
          lon: c.lon,
          kind: c.class,
        })) ?? []),
      ]
    : [];
  if (!route.path && !editing)
    return (
      <Card>
        <p className="muted">
          This route stores notes only and has no mapped path.
        </p>
        <Button onClick={() => setEditing(true)}>Draw it on the map</Button>
      </Card>
    );
  return (
    <div className="stack">
      <PlannerMap
        lines={shown ? [{ coordinates: shown, selected: true }] : []}
        highlight={highlight}
        points={points}
        onPick={editing ? (lat, lon) => editor.add({ lat, lon }) : undefined}
        fitKey={editing ? 'edit' : 'view-' + route.updated_at}
        label={editing ? 'Route editor. Tap to add a waypoint.' : 'Route map'}
      />
      {editing ? (
        <Card>
          <h2>Edit route</h2>
          <p className="muted">
            Tap the map to add waypoints. The path follows mapped runnable ways
            only; gaps are never drawn as straight lines.
          </p>
          <ol>
            {editor.waypoints.map((w, i) => (
              <li key={i}>
                {w.lat.toFixed(5)}, {w.lon.toFixed(5)}{' '}
                <Button
                  variant="ghost"
                  onClick={() => editor.move(i, -1)}
                  aria-label={`Move waypoint ${i + 1} up`}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => editor.move(i, 1)}
                  aria-label={`Move waypoint ${i + 1} down`}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => editor.remove(i)}
                  aria-label={`Remove waypoint ${i + 1}`}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ol>
          {snap.data?.status === 'error' && (
            <ErrorState message={snap.data.message!} />
          )}
          {snap.error && <ErrorState message={snap.error.message} />}
          {snap.data?.metrics && (
            <p>
              {(snap.data.metrics.distance_m / 1000).toFixed(2)} km ·{' '}
              {snap.data.metrics.crossings.length} crossings
              {snap.isFetching && ' · updating…'}
            </p>
          )}
          <div className="row">
            <Button variant="outline" onClick={() => editor.closeLoop()}>
              Close loop
            </Button>
            <Button
              disabled={
                !snap.data?.geometry || snap.isFetching || save.isPending
              }
              onClick={() => save.mutate()}
            >
              Save changes
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!editor.dirty || confirm('Discard your changes?')) {
                  editor.setDirty(false);
                  setEditing(false);
                }
              }}
            >
              Cancel
            </Button>
          </div>
          {save.error && <ErrorState message={save.error.message} />}
        </Card>
      ) : (
        <Card>
          <p className="metric">{(route.distance_m / 1000).toFixed(2)} km</p>
          {route.generation?.reasons && (
            <ul>
              {route.generation.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {route.validation && (
            <p className="muted">
              {route.validation.valid
                ? 'Follows mapped runnable ways.'
                : 'Validation found issues:'}{' '}
              {route.validation.issues?.map((i) => i.message).join(' ')}
            </p>
          )}
          <div className="row">
            <Button asChild variant="outline">
              <a href={`/api/routes/${route.id}/gpx`} download>
                Download GPX
              </a>
            </Button>
            <Button variant="outline" onClick={() => setConfirmCoros(true)}>
              Send to COROS
            </Button>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Edit on map
            </Button>
          </div>
          <details>
            <summary>Import the GPX manually into COROS</summary>
            <ol>
              <li>Download the GPX file above.</li>
              <li>
                In the COROS app open Profile → Routes (or COROS Training Hub →
                Routes) and choose Import.
              </li>
              <li>
                Select the file, check the preview, then sync the route to your
                watch for navigation.
              </li>
            </ol>
          </details>
        </Card>
      )}
      {conditions.data && conditions.data.status !== 'no_geometry' && (
        <Card>
          <h2>Conditions on this route</h2>
          <p
            className={
              conditions.data.status === 'caution' ? 'notice' : 'muted'
            }
          >
            {conditions.data.status === 'caution'
              ? 'Caution: a likely hazard is reported on this route.'
              : conditions.data.status === 'check'
                ? 'Some reports along this route may still apply.'
                : 'No current reports within 40 m of this route.'}{' '}
            {conditions.data.note} Checked{' '}
            {new Date(conditions.data.checked_at).toLocaleTimeString()}.
          </p>
          {conditions.data.assessments.map((a) => (
            <AssessmentCard
              key={a.report_ids.join()}
              a={a}
              userId={userId}
              compact
            />
          ))}
        </Card>
      )}
      <Dialog
        title="Send this route to COROS?"
        description="KindaMoving will upload this route's GPX to your COROS account using COROS's official route import. It appears in the COROS app's Routes list after processing; sync it to your watch from there."
        open={confirmCoros}
        onOpenChange={setConfirmCoros}
      >
        {coros.error && <ErrorState message={coros.error.message} />}
        <Button disabled={coros.isPending} onClick={() => coros.mutate()}>
          Yes, send to my COROS account
        </Button>
      </Dialog>
    </div>
  );
}
