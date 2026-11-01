// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));
import { createServerClient } from '@supabase/ssr';
import { proxy } from '@/proxy';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each([
  '/api/healthz',
  '/api/readyz',
  '/api/jobs/run',
  '/api/conditions/official',
  '/api/form/cleanup',
])(
  'keeps service probes/schedules independent of session refresh: %s',
  async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://pilot.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const response = await proxy(new NextRequest('https://run.test' + path));
    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'strict-dynamic',
    );
  },
);
it('keeps CSP nonce, refreshed cookies and cache headers together', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://pilot.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
  vi.mocked(createServerClient).mockImplementation(
    (_url, _key, options) =>
      ({
        auth: {
          getClaims: async () => {
            const cookies = options?.cookies as {
              setAll: (v: unknown[], h: Record<string, string>) => void;
            };
            cookies.setAll(
              [
                {
                  name: 'session',
                  value: 'refreshed',
                  options: { httpOnly: true },
                },
              ],
              { 'Cache-Control': 'private, no-store' },
            );
            return { data: null, error: null };
          },
        },
      }) as unknown as ReturnType<typeof createServerClient>,
  );
  const response = await proxy(new NextRequest('https://run.test/app'));
  expect(response.cookies.get('session')?.value).toBe('refreshed');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Content-Security-Policy')).toContain(
    response.headers.get('x-middleware-request-x-nonce')!,
  );
});
