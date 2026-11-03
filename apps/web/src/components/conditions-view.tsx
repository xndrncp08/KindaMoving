'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { LocateFixed } from 'lucide-react';
import { Button, Card, ErrorState, Skeleton, ConfirmButton } from '@km/ui';
import { api, conditionsQuery, keys } from '@/lib/queries';
import { KINDS, type Assessment } from '@/lib/conditions';
import { useMap } from '@/lib/stores';
import { submitReport } from '@/lib/offline/outbox';
import type { MapPoint } from './planner-map';
const PlannerMap = dynamic(() => import('./planner-map'), {
  ssr: false,
  loading: () => <Skeleton />,
});
const statusText = {
  likely: 'Likely present',
  possible: 'Possibly present',
  unlikely: 'Probably cleared',
  stale: 'Old report — current state unknown',
};
const form = z.object({
  kind: z.enum(KINDS as [string, ...string[]]),
  severity: z.coerce.number().int().min(1).max(3),
  description: z.string().trim().max(500),
  minutes_ago: z.coerce.number().int().min(0).max(4320),
});

export function AssessmentCard({
  a,
  userId,
  compact,
}: {
  a: Assessment;
  userId: string;
  compact?: boolean;
}) {
  const client = useQueryClient();
  const vote = useMutation({
    mutationFn: (v: 'confirm' | 'clear' | 'flag') =>
      api(`conditions/${a.report_ids[0]}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote: v }),
      }),
    onSuccess: () => {
      toast.success('Thanks — confidence updated.');
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'conditions'),
      });
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      Promise.all(
        a.report_ids.map((id) =>
          api(`conditions/${id}`, { method: 'DELETE' }).catch(() => null),
        ),
      ),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'conditions'),
      }),
  });
  return (
    <Card>
      <p className="eyebrow">
        {a.kind} · {statusText[a.status]} · {Math.round(a.probability * 100)}%
        {a.conflicting && ' · conflicting reports'}
      </p>
      <p>{a.description || 'No description.'}</p>
      <p className="muted">
        Last observed {new Date(a.last_observed_at).toLocaleString()} ·{' '}
        {a.independent_sources} independent source(s)
        {a.official && ` · ${a.official}`} · severity {a.severity}/3
      </p>
      {!compact && (
        <details>
          <summary>Why this confidence?</summary>
          <ul>
            {a.factors.map((f, i) => (
              <li key={i}>
                {f.source}, {f.age_h} h old, reliability{' '}
                {f.reliability.toFixed(2)} → weight {f.weight.toFixed(2)} (
                {f.log_odds > 0 ? '+' : ''}
                {f.log_odds.toFixed(2)} log-odds)
              </li>
            ))}
          </ul>
          <p className="muted">
            Starts from a 5% prior; evidence fades with a half-life that depends
            on the condition and recent weather.
          </p>
        </details>
      )}
      {!a.official && (
        <div className="row">
          {a.own ? (
            <ConfirmButton
              disabled={remove.isPending}
              title="Delete your report?"
              description="Other runners will no longer see it, and its votes are removed."
              confirmLabel="Delete Report"
              onConfirm={() => remove.mutate()}
            >
              Delete My Report
            </ConfirmButton>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={vote.isPending}
                onClick={() => vote.mutate('confirm')}
              >
                Still there
              </Button>
              <Button
                variant="outline"
                disabled={vote.isPending}
                onClick={() => vote.mutate('clear')}
              >
                Cleared
              </Button>
              <Button
                variant="ghost"
                disabled={vote.isPending}
                onClick={() => vote.mutate('flag')}
              >
                Report abuse
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export function ConditionsView({ userId }: { userId: string }) {
  const client = useQueryClient();
  const viewport = useMap((s) => s.viewport);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const q = useQuery(
    conditionsQuery(userId, viewport.latitude, viewport.longitude),
  );
  const { register, handleSubmit, reset, formState, setValue, watch } = useForm<
    z.input<typeof form>,
    unknown,
    z.output<typeof form>
  >({
    resolver: zodResolver(form),
    defaultValues: {
      kind: 'ice',
      severity: 2,
      description: '',
      minutes_ago: 0,
    },
  });
  const report = useMutation({
    mutationFn: (f: z.output<typeof form>) =>
      submitReport(userId, {
        kind: f.kind,
        severity: f.severity,
        lat: pin!.lat,
        lon: pin!.lon,
        observed_at: new Date(Date.now() - f.minutes_ago * 60000).toISOString(),
        description: f.description,
        client_id: crypto.randomUUID(),
      }),
    onSuccess: (r) => {
      toast.success(
        r === 'queued'
          ? 'Saved offline — it will be sent when you reconnect.'
          : 'Report shared. Thank you.',
      );
      reset();
      setPin(null);
      void client.invalidateQueries({
        queryKey: keys.resource(userId, 'conditions'),
      });
    },
  });
  const assessments = q.data?.assessments ?? [];
  const points: MapPoint[] = [
    ...assessments
      .filter((a) => a.status !== 'stale')
      .map((a) => ({ lat: a.lat, lon: a.lon, kind: 'hazard' as const })),
    ...(pin ? [{ ...pin, kind: 'waypoint' as const }] : []),
  ];
  return (
    <div className="planner conditions-layout">
      <div className="stack">
        <Card>
          <h2>Report a condition</h2>
          <p className="muted">
            {pin
              ? `At ${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}.`
              : 'Tap the map where you saw it.'}{' '}
            Reports are public without your name; your exact identity is never
            shown.
          </p>
          <form
            className="stack"
            onSubmit={handleSubmit((f) =>
              pin
                ? report.mutate(f)
                : toast.error('Tap the map to place the report.'),
            )}
          >
            {/* Outdoors, gloved or tired: location in one tap, everything else
                as large single-tap choices; typing is optional. */}
            <div className="row">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigator.geolocation.getCurrentPosition(
                    (p) =>
                      setPin({
                        lat: p.coords.latitude,
                        lon: p.coords.longitude,
                      }),
                    () =>
                      toast.error(
                        'Location unavailable. Tap the map where you saw it instead.',
                      ),
                    { enableHighAccuracy: true, timeout: 10000 },
                  )
                }
              >
                <LocateFixed size={16} aria-hidden="true" />
                Use My Location
              </Button>
            </div>
            <fieldset>
              <legend>What</legend>
              <div className="chips">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="chip"
                    aria-pressed={watch('kind') === k}
                    onClick={() => setValue('kind', k)}
                  >
                    {k.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>How bad</legend>
              <div className="chips">
                {(
                  [
                    [1, 'Minor'],
                    [2, 'Moderate'],
                    [3, 'Avoid'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className="chip"
                    aria-pressed={Number(watch('severity')) === v}
                    onClick={() => setValue('severity', v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Seen</legend>
              <div className="chips">
                {(
                  [
                    [0, 'Just now'],
                    [15, '15 min ago'],
                    [60, '1 h ago'],
                    [180, '3 h ago'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    className="chip"
                    aria-pressed={Number(watch('minutes_ago')) === v}
                    onClick={() => setValue('minutes_ago', v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Details (optional)
              <textarea
                maxLength={500}
                autoComplete="off"
                {...register('description')}
              />
            </label>
            {formState.errors.minutes_ago && (
              <p className="field-error">Within the last 72 hours.</p>
            )}
            {report.error && <ErrorState message={report.error.message} />}
            <Button disabled={report.isPending}>
              {report.isPending ? 'Sharing…' : 'Share Report'}
            </Button>
          </form>
        </Card>
        <p className="notice">
          {q.data?.note ?? 'No report is not the same as clear.'}
        </p>
        {q.isPending ? (
          <Skeleton />
        ) : q.error ? (
          <ErrorState
            message={q.error.message}
            retry={() => void q.refetch()}
          />
        ) : null}
        {assessments.map((a) => (
          <AssessmentCard key={a.report_ids.join()} a={a} userId={userId} />
        ))}
        {q.data && assessments.length === 0 && (
          <p className="muted">
            No reports in this area in the last 30 days. That does not mean
            paths are clear.
          </p>
        )}
      </div>
      <PlannerMap
        points={points}
        onPick={(lat, lon) => setPin({ lat, lon })}
        fitKey={undefined}
        label="Conditions map. Tap to place a report."
        legend={['hazard', 'start']}
      />
    </div>
  );
}
