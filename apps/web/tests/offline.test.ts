import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allFor, purgeOtherUsers, put } from '@/lib/offline/db';
import {
  flush,
  submitReport,
  useOffline,
  type OutboxItem,
} from '@/lib/offline/outbox';
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  await purgeOtherUsers(null);
});
const ok = () => new Response('{"id":"x"}', { status: 201 });
const body = (id: string) => ({
  client_id: id,
  kind: 'ice',
  severity: 2,
  lat: 51,
  lon: -114,
  observed_at: new Date().toISOString(),
  description: '',
});
describe('offline outbox', () => {
  it('queues on network failure and replays in order with the same client_id', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await submitReport('u1', body('c1'))).toBe('queued');
    expect(await submitReport('u1', body('c2'))).toBe('queued');
    expect(useOffline.getState().pending).toBe(2);
    fetchMock.mockImplementation(async () => ok());
    expect(await flush('u1')).toBe(2);
    const sent = fetchMock.mock.calls
      .slice(2)
      .map((c) => JSON.parse(c[1].body).client_id);
    expect(sent).toEqual(['c1', 'c2']);
    expect(useOffline.getState().pending).toBe(0);
  });
  it('keeps order and stops when still offline; surfaces server rejections', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await submitReport('u1', body('a'));
    await submitReport('u1', body('b'));
    expect(await flush('u1')).toBe(0);
    expect(
      (await allFor<OutboxItem>('outbox', 'u1')).every(
        (i) => i.status === 'pending',
      ),
    ).toBe(true);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        new Response('{"error":"Reports must describe the last 72 hours."}', {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(ok());
    expect(await flush('u1')).toBe(1);
    expect(useOffline.getState().rejected[0]).toMatchObject({
      id: 'a',
      error: 'Reports must describe the last 72 hours.',
    });
  });
  it('validation errors are not queued as offline', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"Invalid report."}', { status: 400 }),
    );
    await expect(submitReport('u1', body('bad'))).rejects.toThrow(
      'Invalid report.',
    );
    expect(await allFor('outbox', 'u1')).toHaveLength(0);
  });
  it('identity changes purge other users’ local data', async () => {
    await put('drafts', { key: 'route:1', userId: 'u1', waypoints: [] });
    await put('drafts', { key: 'route:2', userId: 'u2', waypoints: [] });
    await purgeOtherUsers('u2');
    expect(await allFor('drafts', 'u1')).toHaveLength(0);
    expect(await allFor('drafts', 'u2')).toHaveLength(1);
    await purgeOtherUsers(null);
    expect(await allFor('drafts', 'u2')).toHaveLength(0);
  });
});
