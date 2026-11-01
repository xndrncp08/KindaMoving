// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { contentSecurityPolicy } from '@/lib/security';
import { deploymentErrors } from '@/lib/server/deployment';
import { zonedToUtc } from '@/lib/routes/time';
import { analytics } from '@/lib/server/analytics';
const good = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://pilot.supabase.co',
  NEXT_PUBLIC_SITE_URL: 'https://run.test',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  SUPABASE_SECRET_KEY: 'server-only',
  ANALYTICS_URL: 'https://analytics.test',
  ANALYTICS_SERVICE_TOKEN: 'a'.repeat(32),
  CRON_SECRET: 'b'.repeat(32),
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  WEATHER_DISABLED: 'true',
};
it('validates production configuration without exposing values', () => {
  expect(deploymentErrors(good)).toEqual([]);
  const errors = deploymentErrors({
    ...good,
    ANALYTICS_URL: 'http://user:secret@localhost',
    TOKEN_ENCRYPTION_KEY: 'sensitive',
  });
  expect(errors.join()).not.toContain('sensitive');
  expect(errors.join()).not.toContain('user:secret');
  expect(errors.length).toBeGreaterThan(0);
  expect(
    deploymentErrors({ ...good, CRON_SECRET: good.ANALYTICS_SERVICE_TOKEN }),
  ).toContain('Use distinct service and scheduler secrets');
});
it('restricts scripts, maps, workers, storage and outbound origins', () => {
  const policy = contentSecurityPolicy(
    'test',
    false,
    good.NEXT_PUBLIC_SUPABASE_URL,
  );
  expect(policy).toContain("'nonce-test' 'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(
    policy.split('; ').find((x) => x.startsWith('script-src')),
  ).not.toContain('unsafe-inline');
  expect(policy).toContain("worker-src 'self' blob:");
  expect(policy).toContain('https://pilot.supabase.co');
  expect(policy).toContain('wss://pilot.supabase.co');
  expect(policy).toContain('https://tiles.openfreemap.org');
  expect(policy).not.toContain('analytics.test');
  expect(policy).not.toContain('https:;');
});
it.each([
  '2026-11-01T01:30:00',
  '2026-11-01T03:00:00',
  '2026-11-02T09:00:00',
  '2027-01-15T09:00:00',
])('Calgary remains UTC-6 on %s with old or new ICU', (wall) =>
  expect(
    zonedToUtc(wall, 'America/Edmonton')!.getTime() - Date.parse(wall + 'Z'),
  ).toBe(21600000),
);
it('retains historical Alberta winter and summer offsets', () => {
  expect(
    zonedToUtc('2025-01-15T09:00:00', 'America/Edmonton')!.toISOString(),
  ).toBe('2025-01-15T16:00:00.000Z');
  expect(
    zonedToUtc('2025-07-15T09:00:00', 'America/Edmonton')!.toISOString(),
  ).toBe('2025-07-15T15:00:00.000Z');
  expect(
    zonedToUtc('2025-03-09T01:30:00', 'America/Edmonton')!.toISOString(),
  ).toBe('2025-03-09T08:30:00.000Z');
  expect(
    zonedToUtc('2025-03-09T03:30:00', 'America/Edmonton')!.toISOString(),
  ).toBe('2025-03-09T09:30:00.000Z');
});
it('never forwards service bearer credentials through redirects', async () => {
  vi.stubEnv('ANALYTICS_URL', good.ANALYTICS_URL);
  vi.stubEnv('ANALYTICS_SERVICE_TOKEN', good.ANALYTICS_SERVICE_TOKEN);
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await analytics('/healthz');
  expect(fetch.mock.calls[0][1].redirect).toBe('error');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
vi.mock('@/lib/supabase/admin', () => ({ admin: vi.fn() }));
import { admin } from '@/lib/supabase/admin';
import { GET as cleanup } from '@/app/api/form/cleanup/route';
import { GET as official } from '@/app/api/conditions/official/route';
import { GET as runJobs } from '@/app/api/jobs/run/route';
describe('scheduled retention', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'b'.repeat(32));
  });
  it.each([cleanup, official, runJobs])(
    'requires scheduler authentication',
    async (handler) => {
      expect(
        (await handler(new Request('https://run.test/api/form/cleanup')))
          .status,
      ).toBe(401);
    },
  );
  it('retains metadata on Storage failure so deletion is retryable', async () => {
    const update = vi.fn();
    const remove = vi.fn().mockResolvedValue({ error: new Error('down') });
    vi.mocked(admin).mockReturnValue({
      from: () => ({
        select: () => ({
          lt: () => ({
            not: () => ({
              limit: async () => ({
                data: [{ id: 'a', annotated_path: 'u/a.mp4' }],
                error: null,
              }),
            }),
          }),
        }),
        update,
      }),
      storage: { from: () => ({ remove }) },
    } as unknown as ReturnType<typeof admin>);
    const response = await cleanup(
      new Request('https://run.test/api/form/cleanup', {
        headers: { authorization: 'Bearer ' + 'b'.repeat(32) },
      }),
    );
    expect(response.status).toBe(503);
    expect(update).not.toHaveBeenCalled();
  });
});

import { MAX_FILE_BYTES } from '@/lib/ingestion';
it('reserves multipart overhead below the Vercel request ceiling', () =>
  expect(MAX_FILE_BYTES + 65536).toBeLessThan(4500000));

import * as officialService from '@/lib/server/official';
it('exposes scheduled feed failures as retryable HTTP failures', async () => {
  vi.stubEnv('CRON_SECRET', 'b'.repeat(32));
  vi.spyOn(officialService, 'importOfficial').mockResolvedValue({
    detours: 0,
    incidents: 0,
    errors: ['fetch failed'],
  });
  expect(
    (
      await official(
        new Request('https://run.test/api/conditions/official', {
          headers: { authorization: 'Bearer ' + 'b'.repeat(32) },
        }),
      )
    ).status,
  ).toBe(503);
});
it('clears retention pointers only after successful storage deletion', async () => {
  const update = vi.fn(() => ({ in: async () => ({ error: null }) }));
  vi.mocked(admin).mockReturnValue({
    from: () => ({
      select: () => ({
        lt: () => ({
          not: () => ({
            limit: async () => ({
              data: [{ id: 'a', annotated_path: 'u/a.mp4' }],
              error: null,
            }),
          }),
        }),
      }),
      update,
    }),
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  } as unknown as ReturnType<typeof admin>);
  const response = await cleanup(
    new Request('https://run.test/api/form/cleanup', {
      headers: { authorization: 'Bearer ' + 'b'.repeat(32) },
    }),
  );
  expect(response.status).toBe(200);
  expect(update).toHaveBeenCalledWith({ annotated_path: null });
});
