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
            return { data: { claims: { sub: 'u1' } }, error: null };
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
function session(claims: object | null, error: object | null = null) {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://pilot.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key');
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getClaims: async () => ({ data: claims && { claims }, error }),
    },
  } as unknown as ReturnType<typeof createServerClient>);
}
it('sends signed-out runners to login and remembers where they were going', async () => {
  session(null);
  const response = await proxy(
    new NextRequest('https://run.test/app/routes?start=1'),
  );
  expect(response.headers.get('location')).toBe(
    'https://run.test/login?next=%2Fapp%2Froutes%3Fstart%3D1',
  );
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
it('leaves refresh failures to the server check instead of guessing', async () => {
  session(null, { message: 'network' });
  const response = await proxy(new NextRequest('https://run.test/app'));
  expect(response.headers.get('location')).toBeNull();
});
it('skips the login form for a signed-in runner, unless a server check rejected the session', async () => {
  session({ sub: 'u1' });
  const signedIn = await proxy(
    new NextRequest('https://run.test/login?next=%2Fapp%2Fgear'),
  );
  expect(signedIn.headers.get('location')).toBe('https://run.test/app/gear');
  const rejected = await proxy(
    new NextRequest('https://run.test/login?error=session'),
  );
  expect(rejected.headers.get('location')).toBeNull();
});
it('does not redirect API calls; they answer 401 themselves', async () => {
  session(null);
  const response = await proxy(new NextRequest('https://run.test/api/summary'));
  expect(response.headers.get('location')).toBeNull();
});
