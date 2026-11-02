'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Input, ErrorState } from '@km/ui';
import { MAX_FILE_BYTES } from '@/lib/ingestion';
import { jobsQuery, keys, useJobAction } from '@/lib/queries';
const statusText: Record<string, string> = {
  queued: 'Waiting',
  running: 'Processing',
  retry_wait: 'Retrying soon',
  succeeded: 'Imported',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
const outcomeText: Record<string, string> = {
  created: 'new activity',
  merged: 'matched your manual entry',
  duplicate: 'already in your log',
  existing: 'already imported',
};
export function UploadForm({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const client = useQueryClient();
  const jobs = useQuery(jobsQuery(userId));
  const action = useJobAction(userId);
  const imports = (jobs.data ?? [])
    .filter((j) => j.kind === 'activity_import')
    .slice(0, 3);
  return (
    <Card id="import" style={{ scrollMarginTop: '5rem' }}>
      <h2>Import a Run</h2>
      <p className="muted">
        GPX or FIT, up to 4&nbsp;MiB. Splits, heart rate and elevation are added
        in the background; uploading the same file twice never duplicates a run.
      </p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const body = new FormData(form);
          const file = body.get('file');
          setError('');
          setMessage('');
          if (!(file instanceof File) || file.size > MAX_FILE_BYTES) {
            setError('Choose a GPX or FIT file up to 4 MiB.');
            return;
          }
          // GPX carries no time zone; the browser's zone is the fallback for local dates.
          body.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
          setBusy(true);
          try {
            const response = await fetch('/api/uploads', {
              method: 'POST',
              body,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Upload failed.');
            setMessage(result.message);
            form.reset();
            await client.invalidateQueries({
              queryKey: keys.resource(userId, 'jobs'),
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Activity file
          <Input name="file" type="file" accept=".gpx,.fit" required />
        </label>
        {error && <ErrorState message={error} />}
        <Button disabled={busy}>
          {busy ? 'Uploading…' : 'Upload and Import'}
        </Button>
        {message && <p role="status">{message}</p>}
      </form>
      {imports.length > 0 && (
        <div className="stack" aria-live="polite">
          <h3>Recent imports</h3>
          {imports.map((j) => {
            const result = j.result as {
              activity_id?: string;
              outcome?: string;
            } | null;
            return (
              <div key={j.id} className="row between">
                <span>
                  <span
                    className={
                      j.status === 'succeeded'
                        ? 'badge quiet'
                        : j.status === 'failed'
                          ? 'badge danger'
                          : 'badge'
                    }
                  >
                    {statusText[j.status]}
                  </span>{' '}
                  <span suppressHydrationWarning>
                    {new Intl.DateTimeFormat(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(j.created_at))}
                  </span>
                  {result?.outcome &&
                    ` · ${outcomeText[result.outcome] ?? result.outcome}`}
                  {j.status === 'retry_wait' &&
                    ` · attempt ${j.attempts}/${j.max_attempts}`}
                  {j.error_message && j.status !== 'succeeded' && (
                    <span className="muted"> · {j.error_message}</span>
                  )}
                </span>
                <span className="row">
                  {result?.activity_id && (
                    <Link href={'/app/activities/' + result.activity_id}>
                      View run ↗
                    </Link>
                  )}
                  {j.status === 'failed' && (
                    <Button
                      variant="ghost"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ id: j.id, action: 'retry' })
                      }
                    >
                      Retry
                    </Button>
                  )}
                  {['queued', 'retry_wait', 'running'].includes(j.status) && (
                    <Button
                      variant="ghost"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ id: j.id, action: 'cancel' })
                      }
                    >
                      Cancel
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
