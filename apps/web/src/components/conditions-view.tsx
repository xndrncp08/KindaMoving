'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button, Card, ErrorState, Input, Skeleton } from '@km/ui';
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
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => confirm('Delete your report?') && remove.mutate()}
            >
              Delete my report
            </Button>
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
  const { register, handleSubmit, reset, formState } = useForm<
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
    <div className="planner">
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
            <div className="row">
              <label>
                What
                <select {...register('kind')}>
                  {KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Severity
                <select {...register('severity')}>
                  <option value={1}>Minor</option>
                  <option value={2}>Moderate</option>
                  <option value={3}>Avoid</option>
                </select>
              </label>
              <label>
                Seen (minutes ago)
                <Input type="number" {...register('minutes_ago')} />
              </label>
            </div>
            <label>
              Details
              <textarea maxLength={500} {...register('description')} />
            </label>
            {formState.errors.minutes_ago && (
              <p className="field-error">Within the last 72 hours.</p>
            )}
            {report.error && <ErrorState message={report.error.message} />}
            <Button disabled={report.isPending}>Share report</Button>
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
      />
    </div>
  );
}
