'use client';
import { useSyncExternalStore } from 'react';

/** Live media-query match; false during SSR so server and first client render agree. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener('change', notify);
      return () => m?.removeEventListener('change', notify);
    },
    () => !!window.matchMedia?.(query).matches,
    () => false,
  );
}
