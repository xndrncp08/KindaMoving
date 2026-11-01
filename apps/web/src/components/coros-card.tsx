'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, ErrorState, Skeleton, ConfirmButton } from '@km/ui';
import { api, jobsQuery, keys } from '@/lib/queries';
interface Status {
  status: 'disconnected' | 'connected' | 'error' | 'reauth_required';
  issuer?: string;
  capabilities?: string[];
  connected_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  fit_quota?: { used: number; resets_at: string };
  records?: Record<string, number>;
}
const reasons: Record<string, string> = {
  denied: 'You declined access in COROS.',
  state:
    'The sign-in attempt expired or did not match this session. Try again.',
  exchange: 'COROS did not complete authorization. Try again later.',
  provider: 'COROS reported an error during sign-in.',
  code: 'COROS returned no authorization code.',
};
const recordLabels: Record<string, string> = {
  imported: 'imported',
  duplicate: 'already in your log',
  skipped: 'not runs',
  deferred_quota: 'waiting for quota',
  failed: 'failed',
  seen: 'queued',
};
export function CorosCard({ userId }: { userId: string }) {
  const client = useQueryClient();
  const params = useSearchParams();
  const [region, setRegion] = useState('auto');
  const status = useQuery({
    queryKey: keys.resource(userId, 'coros'),
    queryFn: () => api<Status>('coros'),
  });
  const jobs = useQuery(jobsQuery(userId));
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.resource(userId, 'coros') });
    void client.invalidateQueries({ queryKey: keys.resource(userId, 'jobs') });
  };
  const connect = useMutation({
    mutationFn: () =>
      api<{ url: string }>('coros/connect', {
        method: 'POST',
        body: JSON.stringify({ region }),
      }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const sync = useMutation({
    mutationFn: (backfill_days?: number) =>
      api('coros/sync', {
        method: 'POST',
        body: JSON.stringify(backfill_days ? { backfill_days } : {}),
      }),
    onSuccess: () => {
      toast.success('Sync queued.');
      refresh();
    },
  });
  const disconnect = useMutation({
    mutationFn: () =>
      api<{ revoked_at_coros: boolean }>('coros', { method: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(
        r.revoked_at_coros
          ? 'Disconnected and access revoked at COROS.'
          : 'Disconnected. Stored tokens were deleted; COROS did not confirm revocation, so also remove KindaMoving in your COROS account.',
      );
      refresh();
    },
  });
  const history = (jobs.data ?? [])
    .filter((j) => j.kind.startsWith('coros'))
    .slice(0, 6);
  if (status.isPending) return <Skeleton />;
  if (status.error)
    return (
      <ErrorState
        message={status.error.message}
        retry={() => void status.refetch()}
      />
    );
  const s = status.data;
  const flash = params.get('coros');
  return (
    <div className="stack">
      {flash === 'error' && (
        <ErrorState
          message={
            reasons[params.get('reason') ?? ''] ?? 'COROS connection failed.'
          }
        />
      )}
      <p>
        <span className="badge">
          COROS ·{' '}
          {
            {
              connected: 'Connected (verified)',
              disconnected: 'Not connected',
              error: 'Connection error',
              reauth_required: 'Reconnect required',
            }[s.status]
          }
        </span>
      </p>
      <p className="muted">
        Uses COROS&apos;s official MCP service with your explicit OAuth consent.
        KindaMoving reads activity lists and original FIT files, and only writes
        to COROS (routes, workouts) after you confirm each item. Live watch
        tracking and watch control are not available through COROS&apos;s public
        interfaces.
      </p>
      {s.last_error && <p role="alert">{s.last_error}</p>}
      {s.status === 'connected' ? (
        <>
          <p className="muted">
            Connected{' '}
            {s.connected_at
              ? new Date(s.connected_at).toLocaleDateString()
              : ''}{' '}
            via {s.issuer?.replace('https://', '')} · last sync{' '}
            {s.last_sync_at
              ? new Date(s.last_sync_at).toLocaleString()
              : 'pending'}
          </p>
          <p className="muted">
            FIT downloads today: {s.fit_quota?.used ?? 0}/50 (COROS limit,
            resets{' '}
            {s.fit_quota
              ? new Date(s.fit_quota.resets_at).toLocaleString()
              : ''}
            )
            {s.records &&
              ' · ' +
                Object.entries(s.records)
                  .map(([k, v]) => `${v} ${recordLabels[k] ?? k}`)
                  .join(' · ')}
          </p>
          <div className="row">
            <Button
              disabled={sync.isPending}
              onClick={() => sync.mutate(undefined)}
            >
              Sync now
            </Button>
            <Button
              variant="outline"
              disabled={sync.isPending}
              onClick={() => sync.mutate(90)}
            >
              Import last 90 days
            </Button>
            <ConfirmButton
              disabled={disconnect.isPending}
              title="Disconnect COROS?"
              description="KindaMoving revokes its access and deletes the stored tokens. Imported activities stay in your log."
              confirmLabel="Disconnect COROS"
              onConfirm={() => disconnect.mutate()}
            >
              Disconnect
            </ConfirmButton>
          </div>
          <details>
            <summary>
              Available COROS capabilities ({s.capabilities?.length ?? 0})
            </summary>
            <p className="muted">{s.capabilities?.join(', ')}</p>
          </details>
        </>
      ) : (
        <div className="row">
          <label>
            Account region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="auto">Automatic</option>
              <option value="us">United States &amp; other regions</option>
              <option value="eu">Europe</option>
              <option value="cn">Mainland China</option>
            </select>
          </label>
          <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
            {s.status === 'reauth_required'
              ? 'Reconnect COROS'
              : 'Connect COROS'}
          </Button>
        </div>
      )}
      {connect.error && <ErrorState message={connect.error.message} />}
      {(sync.error || disconnect.error) && (
        <ErrorState message={(sync.error ?? disconnect.error)!.message} />
      )}
      {history.length > 0 && (
        <details>
          <summary>Sync history</summary>
          <ul>
            {history.map((j) => (
              <li key={j.id}>
                {new Date(j.created_at).toLocaleString()} ·{' '}
                {j.kind.replace('coros_', '')} · {j.status}
                {j.result &&
                  ` · ${Object.entries(j.result)
                    .filter(([, v]) => typeof v === 'number' && v > 0)
                    .map(([k, v]) => `${v} ${k}`)
                    .join(', ')}`}
                {j.error_message &&
                  j.status !== 'succeeded' &&
                  ` · ${j.error_message}`}
                <JobEvents id={j.id} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
function JobEvents({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const events = useQuery({
    queryKey: ['job-events', id],
    queryFn: () =>
      api<
        {
          from_status: string | null;
          to_status: string;
          detail: string;
          created_at: string;
        }[]
      >('jobs/' + id),
    enabled: open,
  });
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Diagnostics</summary>
      <ol>
        {events.data?.map((e) => (
          <li key={e.created_at + e.to_status}>
            {new Date(e.created_at).toLocaleTimeString()}{' '}
            {e.from_status ?? 'created'} → {e.to_status}
            {e.detail ? ` (${e.detail})` : ''}
          </li>
        ))}
      </ol>
    </details>
  );
}
