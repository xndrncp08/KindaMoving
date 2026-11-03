// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { analytics } from '@/lib/server/analytics';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function setup(response: Response) {
  vi.stubEnv('ANALYTICS_URL', 'https://analytics.test');
  vi.stubEnv('ANALYTICS_SERVICE_TOKEN', 'x'.repeat(32));
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('does not turn a proxy HTML success into a successful compute result', async () => {
  setup(new Response('<html>proxy unavailable</html>', { status: 200 }));
  await expect(analytics('/v1/activities/parse')).rejects.toMatchObject({
    code: 'analytics_invalid_response',
  });
});
it('retains caller cancellation in addition to the service deadline', async () => {
  const fetch = setup(Response.json({ ok: true }));
  const abort = new AbortController();
  await analytics('/readyz', { signal: abort.signal });
  abort.abort();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
