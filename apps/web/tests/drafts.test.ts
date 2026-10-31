import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  cachedRecord,
  cacheRecord,
  clearDraft,
  draftStatus,
  loadDraft,
  saveDraft,
} from '@/lib/offline/drafts';
describe('drafts', () => {
  it('detects conflicts against the server version', () => {
    expect(draftStatus(undefined, 'v1')).toBe('none');
    expect(draftStatus({ base: 'v1' }, 'v1')).toBe('restorable');
    expect(draftStatus({ base: 'v1' }, 'v2')).toBe('conflict');
    expect(draftStatus({ base: null }, null)).toBe('restorable');
  });
  it('persists per user and scope', async () => {
    await saveDraft('u1', 'route:1', 'v1', { waypoints: [1] });
    expect((await loadDraft('u1', 'route:1'))?.value).toEqual({
      waypoints: [1],
    });
    expect(await loadDraft('u2', 'route:1')).toBeUndefined();
    await clearDraft('u1', 'route:1');
    expect(await loadDraft('u1', 'route:1')).toBeUndefined();
    await cacheRecord('u1', 'route:9', { title: 'River' });
    expect(
      (await cachedRecord<{ title: string }>('u1', 'route:9'))?.value.title,
    ).toBe('River');
  });
});
