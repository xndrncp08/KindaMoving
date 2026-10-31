'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, Dialog, ErrorState, Input } from '@km/ui';
import {
  api,
  keys,
  recordsQuery,
  routeConditionsQuery,
  trainingQuery,
} from '@/lib/queries';
import { duration } from '@/lib/metrics';
import {
  describe,
  totals,
  type SimpleStep,
  type Step,
} from '@/lib/training/steps';
import { alternatives } from '@/lib/training/reconcile';
import { useUnsaved } from './unsaved';

interface WorkoutRecord {
  id: string;
  title: string;
  scheduled_on: string;
  kind?: string;
  steps?: Step[];
  route_id?: string | null;
  planned_distance_m?: number | null;
  status?: string;
  compliance?: { grade?: string; ratio?: number; reason?: string } | null;
  activity_id?: string | null;
}
const KINDS = [
  'easy',
  'long',
  'tempo',
  'intervals',
  'recovery',
  'race',
  'cross',
  'rest',
];
const INTENSITY = [
  'easy',
  'steady',
  'marathon',
  'threshold',
  'interval',
  'repetition',
  'recovery',
] as const;

export function WorkoutPanel({
  workout,
  userId,
}: {
  workout: WorkoutRecord;
  userId: string;
}) {
  const client = useQueryClient();
  const [kind, setKind] = useState(workout.kind ?? 'easy');
  const [steps, setSteps] = useState<Step[]>(workout.steps ?? []);
  const [routeId, setRouteId] = useState<string | null>(
    workout.route_id ?? null,
  );
  const [dirty, setDirty] = useState(false);
  const [coros, setCoros] = useState(false);
  useUnsaved(dirty);
  const monday = new Date(workout.scheduled_on + 'T12:00:00');
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const overview = useQuery(
    trainingQuery(userId, monday.toLocaleDateString('en-CA')),
  );
  const zones = overview.data?.paces.zones;
  const routes = useQuery(recordsQuery(userId, 'routes'));
  const routeConditions = useQuery({
    ...routeConditionsQuery(userId, routeId ?? ''),
    enabled: !!routeId,
  });
  const history = useQuery({
    queryKey: [...keys.resource(userId, 'training'), 'history', workout.id],
    queryFn: () =>
      api<
        {
          id: string;
          title: string;
          scheduled_on: string;
          activity: {
            id: string;
            distance_m: number;
            moving_s: number | null;
            elapsed_s: number;
            avg_hr: number | null;
          } | null;
        }[]
      >(`workouts/${workout.id}/history`),
  });
  const save = useMutation({
    mutationFn: () =>
      api(`workouts/${workout.id}/structure`, {
        method: 'PUT',
        body: JSON.stringify({ kind, steps, route_id: routeId }),
      }),
    onSuccess: () => {
      setDirty(false);
      toast.success('Workout structure saved.');
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'workouts'),
      });
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'training'),
      });
    },
  });
  const push = useMutation({
    mutationFn: () =>
      api(`workouts/${workout.id}/coros`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    onSuccess: () => {
      setCoros(false);
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'jobs'),
      });
      toast.success(
        'Sending to COROS. Check Settings → sync history for the result.',
      );
    },
  });
  const edit = (next: Step[]) => {
    setSteps(next);
    setDirty(true);
  };
  const newStep = (
    type: SimpleStep['type'],
    intensity: SimpleStep['intensity'],
  ): SimpleStep => ({
    type,
    intensity,
    distance_m: 1000,
    ...(zones
      ? {
          pace_s_per_km:
            zones[intensity === 'repetition' ? 'repetition' : intensity],
        }
      : {}),
  });
  const update = (i: number, patch: Partial<SimpleStep>) =>
    edit(
      steps.map((s, k) =>
        k === i && !('times' in s) ? { ...s, ...patch } : s,
      ),
    );
  const t = totals(steps);
  // Other routes' conditions are not known until checked, so only indoor/swap options are offered here.
  const conditionAlternatives =
    routeConditions.data?.status === 'caution'
      ? alternatives(
          {
            kind,
            planned_distance_m:
              t.distance_m || workout.planned_distance_m || null,
          },
          [],
        )
      : [];
  return (
    <div className="stack">
      {workout.compliance && (
        <Card>
          <p>
            {workout.compliance.grade === 'partial'
              ? 'Partially completed'
              : workout.compliance.grade
                ? 'Completed'
                : 'Skipped'}
            {workout.compliance.ratio
              ? ` · ${Math.round(workout.compliance.ratio * 100)}% of planned distance`
              : ''}
            {workout.compliance.reason ? ` · ${workout.compliance.reason}` : ''}
            {workout.activity_id && (
              <>
                {' · '}
                <Link href={'/app/activities/' + workout.activity_id}>
                  View the run ↗
                </Link>
              </>
            )}
          </p>
        </Card>
      )}
      <Card>
        <h2>Structure</h2>
        <label>
          Type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setDirty(true);
            }}
          >
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <ol>
          {steps.map((s, i) => (
            <li key={i}>
              {'times' in s ? (
                <span>{describe(s)}</span>
              ) : (
                <span className="row">
                  <select
                    value={s.type}
                    onChange={(e) =>
                      update(i, { type: e.target.value as SimpleStep['type'] })
                    }
                    aria-label="Step type"
                  >
                    {['warmup', 'work', 'recovery', 'cooldown'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    aria-label="Distance in metres"
                    value={s.distance_m ?? ''}
                    placeholder="m"
                    onChange={(e) =>
                      update(i, {
                        distance_m: Number(e.target.value) || undefined,
                        duration_s: Number(e.target.value)
                          ? undefined
                          : s.duration_s,
                      })
                    }
                  />
                  <Input
                    type="number"
                    aria-label="Duration in minutes"
                    value={s.duration_s ? s.duration_s / 60 : ''}
                    placeholder="min"
                    onChange={(e) =>
                      update(i, {
                        duration_s: Number(e.target.value) * 60 || undefined,
                        distance_m: Number(e.target.value)
                          ? undefined
                          : s.distance_m,
                      })
                    }
                  />
                  <select
                    value={s.intensity}
                    aria-label="Intensity"
                    onChange={(e) => {
                      const intensity = e.target
                        .value as SimpleStep['intensity'];
                      update(i, {
                        intensity,
                        ...(zones ? { pace_s_per_km: zones[intensity] } : {}),
                      });
                    }}
                  >
                    {INTENSITY.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <span className="muted">
                    {s.pace_s_per_km
                      ? `${duration(s.pace_s_per_km[0])}–${duration(s.pace_s_per_km[1])}/km`
                      : ''}
                  </span>
                </span>
              )}
              <Button
                variant="ghost"
                aria-label={`Remove step ${i + 1}`}
                onClick={() => edit(steps.filter((_, k) => k !== i))}
              >
                ✕
              </Button>
            </li>
          ))}
        </ol>
        <div className="row">
          <Button
            variant="outline"
            onClick={() => edit([...steps, newStep('warmup', 'easy')])}
          >
            + Warm-up
          </Button>
          <Button
            variant="outline"
            onClick={() => edit([...steps, newStep('work', 'threshold')])}
          >
            + Work
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              edit([
                ...steps,
                {
                  type: 'repeat',
                  times: 6,
                  steps: [
                    newStep('work', 'interval'),
                    {
                      ...newStep('recovery', 'recovery'),
                      distance_m: undefined,
                      duration_s: 120,
                    },
                  ],
                },
              ])
            }
          >
            + Intervals
          </Button>
          <Button
            variant="outline"
            onClick={() => edit([...steps, newStep('cooldown', 'easy')])}
          >
            + Cool-down
          </Button>
        </div>
        <p className="muted">
          {steps.length
            ? `Planned ≈ ${(t.distance_m / 1000).toFixed(1)} km, ${duration(t.duration_s)}.`
            : 'No structure yet.'}{' '}
          Paces from {overview.data?.paces.basis ?? '…'}.
        </p>
        <label>
          Planned route
          <select
            value={routeId ?? ''}
            onChange={(e) => {
              setRouteId(e.target.value || null);
              setDirty(true);
            }}
          >
            <option value="">None</option>
            {routes.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({(r.distance_m / 1000).toFixed(1)} km)
              </option>
            ))}
          </select>
        </label>
        {routeConditions.data?.status === 'caution' && (
          <div className="notice" role="status">
            <p>A likely hazard is reported on this route. Alternatives:</p>
            <ul>
              {conditionAlternatives.map((a) => (
                <li key={a.text}>{a.text}</li>
              ))}
              <li>
                Pick another saved route above; its conditions are checked when
                selected, or <Link href="/app/routes/plan">plan a new one</Link>{' '}
                that avoids current reports.
              </li>
            </ul>
          </div>
        )}
        <div className="row">
          <Button
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            Save structure
          </Button>
          <Button
            variant="outline"
            disabled={!steps.length || dirty}
            onClick={() => setCoros(true)}
          >
            Send to COROS
          </Button>
        </div>
        {save.error && <ErrorState message={save.error.message} />}
      </Card>
      {history.data && history.data.length > 0 && (
        <Card>
          <h2>Previous {kind} sessions</h2>
          <ul>
            {history.data.map((h) => (
              <li key={h.id}>
                {h.scheduled_on} · {h.title}
                {h.activity &&
                  ` · ${(h.activity.distance_m / 1000).toFixed(1)} km at ${duration((h.activity.moving_s ?? h.activity.elapsed_s) / (h.activity.distance_m / 1000))}/km${h.activity.avg_hr ? `, ${Math.round(h.activity.avg_hr)} bpm` : ''}`}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Dialog
        title="Send this workout to COROS?"
        description="KindaMoving will create it in your COROS account (on its date if within 90 days, otherwise in your workout library). If COROS's workout format doesn't match, nothing is sent and you'll see why."
        open={coros}
        onOpenChange={setCoros}
      >
        {push.error && <ErrorState message={push.error.message} />}
        <Button disabled={push.isPending} onClick={() => push.mutate()}>
          Yes, send to COROS
        </Button>
      </Dialog>
    </div>
  );
}
