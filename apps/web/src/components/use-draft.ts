'use client';
import { useEffect, useRef, useState } from 'react';
import {
  clearDraft,
  draftStatus,
  loadDraft,
  saveDraft,
  type Draft,
  type DraftStatus,
} from '@/lib/offline/drafts';
/**
 * Persist `value` as a draft while `dirty`, and expose any earlier draft for this
 * scope with its conflict status against the current server version.
 */
export function useDraft<T>(
  userId: string,
  scope: string,
  base: string | null,
  value: T,
  dirty: boolean,
) {
  const [pending, setPending] = useState<{
    draft: Draft<T>;
    status: DraftStatus;
  } | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = false;
    let alive = true;
    void loadDraft<T>(userId, scope).then((d) => {
      if (!alive) return;
      loaded.current = true;
      const status = draftStatus(d, base);
      setPending(d && status !== 'none' ? { draft: d, status } : null);
    });
    return () => {
      alive = false;
    };
  }, [userId, scope, base]);
  useEffect(() => {
    if (!dirty || !loaded.current) return;
    const t = setTimeout(() => void saveDraft(userId, scope, base, value), 400);
    return () => clearTimeout(t);
  }, [userId, scope, base, value, dirty]);
  return {
    pending,
    dismiss: () => {
      setPending(null);
      void clearDraft(userId, scope);
    },
    clear: () => void clearDraft(userId, scope),
  };
}
