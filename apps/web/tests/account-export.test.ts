// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/api', async (load) => ({
  ...(await load<typeof import('@/lib/api')>()),
  context: vi.fn(),
}));
import { context } from '@/lib/api';
import { GET } from '@/app/api/account/export/route';
it.each([
  { data: null, error: { message: 'private connection details' } },
  { data: null, error: null },
])(
  'does not export when rate-limit admission is unavailable',
  async (result) => {
    const from = vi.fn();
    vi.mocked(context).mockResolvedValue({
      user: { id: 'runner-a' },
      db: {
        rpc: async () => result,
        from,
      },
    } as unknown as Awaited<ReturnType<typeof context>>);
    const response = await GET(
      new Request('https://app.test/api/account/export'),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private connection details');
    expect(from).not.toHaveBeenCalled();
  },
);
