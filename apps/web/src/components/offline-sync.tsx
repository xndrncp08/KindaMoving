'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { keys } from '@/lib/queries';
import { purgeOtherUsers } from '@/lib/offline/db';
import {
  dismiss,
  flush,
  refreshCounts,
  useOffline,
} from '@/lib/offline/outbox';
/**
 * Connectivity state machine: online <-> offline. Entering `online` (and app start)
 * flushes the outbox, then invalidates the data the flushed items affect.
 * Records belonging to another account on this device are purged first.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const client = useQueryClient();
  const online = useOffline((s) => s.online);
  const pending = useOffline((s) => s.pending);
  const rejected = useOffline((s) => s.rejected);
  const syncing = useOffline((s) => s.syncing);
  useEffect(() => {
    const set = useOffline.getState().set;
    const sync = async () => {
      const sent = await flush(userId);
      if (sent) {
        toast.success(`${sent} offline report(s) sent.`);
        void client.invalidateQueries({
          queryKey: keys.resource(userId, 'conditions'),
        });
      }
    };
    const up = () => {
      set({ online: true });
      void sync();
    };
    const down = () => set({ online: false });
    set({ online: navigator.onLine });
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    void purgeOtherUsers(userId)
      .then(() => refreshCounts(userId))
      .then(() => {
        if (navigator.onLine) void sync();
      });
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [client, userId]);
  if (online && !pending && !rejected.length) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      {!online &&
        'You are offline. Saved routes and drafts stay available; reports are queued. '}
      {pending > 0 &&
        `${pending} report(s) waiting to send${syncing ? '…' : '.'} `}
      {rejected.map((r) => (
        <span key={r.id}>
          A queued report was not accepted: {r.error}{' '}
          <button
            type="button"
            className="button-ghost"
            onClick={() => void dismiss(userId, r.id)}
          >
            Dismiss
          </button>
        </span>
      ))}
    </div>
  );
}
