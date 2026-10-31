import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/supabase/server', () => ({ supabase: vi.fn() }));
vi.mock('@/lib/env', () => ({ configured: () => true }));
import { supabase } from '@/lib/supabase/server';
import { context } from '@/lib/api';
import { POST, GET, PATCH, DELETE } from '@/app/api/[resource]/route';
const user = { id: 'a0000000-0000-4000-8000-000000000001' };
const getUser = vi.fn();
const from = vi.fn();
beforeEach(() => {
  vi.mocked(supabase).mockResolvedValue({
    auth: { getUser },
    from,
  } as unknown as Awaited<ReturnType<typeof supabase>>);
  getUser.mockResolvedValue({ data: { user }, error: null });
  from.mockReset();
});
const req = (method: string, body?: unknown, origin = 'http://localhost') =>
  new Request('http://localhost/api/activities', {
    method,
    headers: { origin, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
const params = { params: Promise.resolve({ resource: 'activities' }) };
it('rejects unauthenticated requests', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await GET(req('GET'), params)).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});
it('rejects cross-origin writes before database access', async () => {
  await expect(
    context(req('POST', {}, 'https://evil.test')),
  ).rejects.toMatchObject({ status: 403 });
  expect(from).not.toHaveBeenCalled();
});
it('rejects invalid activity form submissions', async () => {
  expect(
    (await POST(req('POST', { title: 'Run', distance_m: -1 }), params)).status,
  ).toBe(400);
  expect(from).not.toHaveBeenCalled();
});
it('overrides untrusted ownership on create', async () => {
  const single = vi
    .fn()
    .mockResolvedValue({ data: { id: 'created' }, error: null });
  const insert = vi.fn((values: unknown) => {
    void values;
    return { select: () => ({ single }) };
  });
  from.mockReturnValue({ insert });
  const response = await POST(
    req('POST', {
      title: 'Run',
      started_at: '2026-10-31',
      distance_m: 5000,
      elapsed_s: 1500,
      user_id: 'forged',
    }),
    params,
  );
  expect(response.status).toBe(201);
  expect(insert.mock.calls[0][0]).toMatchObject({ user_id: user.id });
});
it('scopes list operations by authenticated user', async () => {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn(() => ({ order: () => ({ limit }) }));
  from.mockReturnValue({ select: () => ({ eq }) });
  expect((await GET(req('GET'), params)).status).toBe(200);
  expect(eq).toHaveBeenCalledWith('user_id', user.id);
});
it('rejects invalid edit and delete IDs', async () => {
  expect((await PATCH(req('PATCH', { id: 'bad' }), params)).status).toBe(400);
  expect((await DELETE(req('DELETE'), params)).status).toBe(400);
});
it('does not expose arbitrary tables', async () => {
  expect(
    (
      await GET(req('GET'), {
        params: Promise.resolve({ resource: 'auth.users' }),
      })
    ).status,
  ).toBe(404);
});
