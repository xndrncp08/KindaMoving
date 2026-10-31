import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordForm } from '@/components/record-form';
import { ProfileForm } from '@/components/profile-form';
import { Shell } from '@/components/shell';
vi.mock('next/navigation', () => ({ usePathname: () => '/app/activities' }));
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));
vi.mock('@/lib/supabase/client', () => ({
  browserSupabase: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn(),
    },
  }),
}));
const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async (_url, init) =>
          new Response(JSON.stringify(init?.method ? { ok: true } : null)),
      ),
  );
});
it('submits a validated activity with a shoe assignment', async () => {
  const saved = vi.fn();
  wrap(
    <RecordForm
      name="activities"
      userId="runner"
      onSaved={saved}
      shoes={[
        {
          id: 'a0000000-0000-4000-8000-000000000001',
          user_id: 'runner',
          title: 'Daily',
          brand: 'Test',
          retired: false,
          initial_distance_m: 0,
        },
      ]}
    />,
  );
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'Park loop' },
  });
  fireEvent.change(screen.getByLabelText('Shoes'), {
    target: { value: 'a0000000-0000-4000-8000-000000000001' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const call = vi.mocked(fetch).mock.calls[0];
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    title: 'Park loop',
    shoe_id: 'a0000000-0000-4000-8000-000000000001',
  });
});
it('retains a form and shows an error after failed CRUD', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: 'Database unavailable' }), {
      status: 503,
    }),
  );
  const saved = vi.fn();
  wrap(<RecordForm name="routes" userId="runner" onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'River' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Database unavailable');
  expect(saved).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
    'River',
  );
});
it('saves onboarding with explicit privacy preferences', async () => {
  wrap(<ProfileForm userId="runner" />);
  await screen.findByLabelText('Preferred name');
  fireEvent.change(screen.getByLabelText('Preferred name'), {
    target: { value: 'Alex' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await waitFor(() =>
    expect(
      vi.mocked(fetch).mock.calls.some((c) => c[1]?.method === 'PUT'),
    ).toBe(true),
  );
  const call = vi.mocked(fetch).mock.calls.find((c) => c[1]?.method === 'PUT')!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({
    preferred_name: 'Alex',
    private_profile: true,
    notifications: false,
  });
});
it('opens and closes accessible mobile navigation', async () => {
  wrap(
    <Shell userId="runner">
      <h1>Activities</h1>
    </Shell>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Gear');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
