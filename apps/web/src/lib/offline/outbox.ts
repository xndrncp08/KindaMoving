import { create } from 'zustand';
import { api } from '../queries';
import { allFor, del, put } from './db';

/**
 * Offline outbox for idempotent mutations (currently condition reports).
 * Each item carries the client-generated `client_id` the server deduplicates on,
 * so replaying after a lost response can never create a duplicate.
 * Network failures keep items queued; a server rejection (e.g. an observation
 * that became older than 72 h while offline) is kept as `rejected` and shown,
 * never silently dropped.
 */
export interface OutboxItem {
  id: string;
  userId: string;
  kind: 'condition_report';
  path: string;
  body: unknown;
  created_at: string;
  attempts: number;
  status: 'pending' | 'rejected';
  error?: string;
}
export const useOffline = create<{
  online: boolean;
  pending: number;
  rejected: OutboxItem[];
  syncing: boolean;
  set: (
    s: Partial<{
      online: boolean;
      pending: number;
      rejected: OutboxItem[];
      syncing: boolean;
    }>,
  ) => void;
}>((set) => ({ online: true, pending: 0, rejected: [], syncing: false, set }));

/** fetch() rejects with TypeError when the network is unreachable; HTTP errors resolve. */
export const isNetworkError = (e: unknown) => e instanceof TypeError;

export async function refreshCounts(userId: string) {
  try {
    const signal = session.signal;
    const items = await allFor<OutboxItem>('outbox', userId);
    if (signal.aborted) return;
    useOffline.getState().set({
      pending: items.filter((i) => i.status === 'pending').length,
      rejected: items.filter((i) => i.status === 'rejected'),
    });
  } catch {
    /* IndexedDB unavailable (private mode): outbox simply isn't offered */
  }
}

export async function submitReport(
  userId: string,
  body: { client_id: string } & Record<string, unknown>,
): Promise<'sent' | 'queued'> {
  const signal = session.signal;
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      await api('conditions', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
      });
      signal.throwIfAborted();
      return 'sent';
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  signal.throwIfAborted();
  await put<OutboxItem>('outbox', {
    id: body.client_id,
    userId,
    kind: 'condition_report',
    path: 'conditions',
    body,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  });
  if (signal.aborted) {
    await del('outbox', body.client_id);
    signal.throwIfAborted();
  }
  await refreshCounts(userId);
  return 'queued';
}

let session = new AbortController();
let flushing: {
  userId: string;
  signal: AbortSignal;
  promise: Promise<number>;
} | null = null;
/** Stop old-account writes before auth changes; keep unsent data until the normal identity purge. */
export function cancelOutbox() {
  session.abort();
  session = new AbortController();
  flushing = null;
  useOffline.getState().set({ syncing: false, pending: 0, rejected: [] });
}
/** Single-flight per identity; late responses must not update a new account's banner. */
export function flush(userId: string): Promise<number> {
  if (flushing?.userId === userId) return flushing.promise;
  if (flushing) cancelOutbox();
  const signal = session.signal;
  const scope = { userId, signal, promise: Promise.resolve(0) };
  flushing = scope;
  scope.promise = (async () => {
    useOffline.getState().set({ syncing: true });
    let sent = 0;
    try {
      const items = (await allFor<OutboxItem>('outbox', userId))
        .filter((i) => i.status === 'pending')
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      for (const item of items) {
        if (signal.aborted) break;
        try {
          await api(item.path, {
            method: 'POST',
            body: JSON.stringify(item.body),
            signal,
          });
          if (signal.aborted) break;
          await del('outbox', item.id);
          sent++;
        } catch (e) {
          if (signal.aborted || isNetworkError(e)) break;
          await put<OutboxItem>('outbox', {
            ...item,
            attempts: item.attempts + 1,
            status: 'rejected',
            error: e instanceof Error ? e.message : 'Rejected',
          });
        }
      }
    } catch {
      /* storage unavailable */
    } finally {
      if (flushing === scope) {
        useOffline.getState().set({ syncing: false });
        await refreshCounts(userId);
        if (flushing === scope) flushing = null;
      }
    }
    return sent;
  })();
  return scope.promise;
}
export async function dismiss(userId: string, id: string) {
  await del('outbox', id);
  await refreshCounts(userId);
}
