'use client';
import { cancelOutbox } from '@/lib/offline/outbox';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, ErrorState, Input } from '@km/ui';
import { api } from '@/lib/queries';
import { resetStores } from '@/lib/stores';
import { purgeOtherUsers } from '@/lib/offline/db';
export function AccountData() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () =>
      api('account', {
        method: 'DELETE',
        body: JSON.stringify({ confirm: typed }),
      }),
    onSuccess: async () => {
      cancelOutbox();
      client.clear();
      resetStores();
      await purgeOtherUsers(null);
      if ('caches' in window)
        for (const k of await caches.keys()) await caches.delete(k);
      location.assign('/');
    },
  });
  return (
    <div className="stack">
      <p className="muted">
        Download everything KindaMoving stores about you as JSON: profile, runs
        and streams, routes, gear, training, reports and sync history. COROS
        tokens are never exported.
      </p>
      <Button asChild variant="outline">
        <a href="/api/account/export" download>
          Export my data
        </a>
      </Button>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete my account
      </Button>
      <Dialog
        title="Delete your account permanently?"
        description="This deletes every run, route, plan, report, video and file, and revokes COROS access. It cannot be undone. Export your data first if you want a copy."
        open={open}
        onOpenChange={setOpen}
      >
        <label>
          Type DELETE to confirm
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </label>
        {remove.error && <ErrorState message={remove.error.message} />}
        <Button
          variant="destructive"
          disabled={typed !== 'DELETE' || remove.isPending}
          onClick={() => remove.mutate()}
        >
          Permanently delete everything
        </Button>
      </Dialog>
    </div>
  );
}
