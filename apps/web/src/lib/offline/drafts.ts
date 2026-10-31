import { del, get, put } from './db';
/**
 * Unsaved editor drafts (route waypoints, gear and other record forms), scoped by
 * user and keyed by what is being edited. Each draft remembers the server version
 * (`base`, the record's updated_at) it started from, so restoring a draft over a
 * record changed elsewhere is detected rather than silently overwriting it.
 */
export interface Draft<T> {
  key: string;
  userId: string;
  base: string | null;
  saved_at: string;
  value: T;
}
export type DraftStatus = 'none' | 'restorable' | 'conflict';
export function draftStatus(
  draft: Pick<Draft<unknown>, 'base'> | undefined,
  serverUpdatedAt: string | null | undefined,
): DraftStatus {
  if (!draft) return 'none';
  return (draft.base ?? null) === (serverUpdatedAt ?? null)
    ? 'restorable'
    : 'conflict';
}
export const draftKey = (userId: string, scope: string) => `${userId}:${scope}`;
export async function saveDraft<T>(
  userId: string,
  scope: string,
  base: string | null,
  value: T,
) {
  try {
    await put<Draft<T>>('drafts', {
      key: draftKey(userId, scope),
      userId,
      base,
      saved_at: new Date().toISOString(),
      value,
    });
  } catch {
    /* storage unavailable: drafts are a convenience, never required */
  }
}
export async function loadDraft<T>(userId: string, scope: string) {
  try {
    return await get<Draft<T>>('drafts', draftKey(userId, scope));
  } catch {
    return undefined;
  }
}
export async function clearDraft(userId: string, scope: string) {
  try {
    await del('drafts', draftKey(userId, scope));
  } catch {
    /* ignore */
  }
}
/** Saved-route snapshots for offline viewing (no tokens or secrets, only the user's own route). */
export async function cacheRecord(
  userId: string,
  scope: string,
  value: unknown,
) {
  try {
    await put('cache', {
      key: draftKey(userId, scope),
      userId,
      saved_at: new Date().toISOString(),
      value,
    });
  } catch {
    /* ignore */
  }
}
export async function cachedRecord<T>(userId: string, scope: string) {
  try {
    return (
      (await get<{ value: T; saved_at: string }>(
        'cache',
        draftKey(userId, scope),
      )) ?? null
    );
  } catch {
    return null;
  }
}
