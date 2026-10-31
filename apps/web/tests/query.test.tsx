import { it, expect, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { recordsQuery, useRecordMutation, keys, api } from '@/lib/queries';
import type { ReactNode } from 'react';
it('isolates resource keys by authenticated identity', () =>
  expect(recordsQuery('a', 'activities').queryKey).not.toEqual(
    recordsQuery('b', 'activities').queryKey,
  ));
it('invalidates related summaries only after successful writes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'new' }))),
  );
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useRecordMutation('runner', 'activities'), {
    wrapper,
  });
  act(() =>
    hook.result.current.mutate({ method: 'POST', data: { title: 'Run' } }),
  );
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.user('runner') });
  cleanup();
  vi.unstubAllGlobals();
});
it('surfaces a failed mutation without a success result', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Denied' }), { status: 403 }),
      ),
  );
  await expect(api('activities', { method: 'POST' })).rejects.toThrow('Denied');
  vi.unstubAllGlobals();
});
