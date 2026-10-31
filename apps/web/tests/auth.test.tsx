import { afterEach, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
const state = vi.hoisted(() => ({
  mode: 'login',
  reset: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('mode=' + state.mode),
}));
vi.mock('@/lib/env', () => ({ configured: () => true }));
vi.mock('@/lib/supabase/client', () => ({
  browserSupabase: () => ({
    auth: {
      resetPasswordForEmail: state.reset,
      signUp: state.signup,
      signInWithPassword: state.login,
    },
  }),
}));
import { AuthForm } from '@/components/auth-form';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('shows real login failures and does not announce success', async () => {
  state.mode = 'login';
  state.login.mockResolvedValue({
    error: new Error('Invalid login credentials'),
  });
  render(<AuthForm />);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'runner@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: 'a-long-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText('Invalid login credentials');
  expect(state.login).toHaveBeenCalledWith({
    email: 'runner@example.test',
    password: 'a-long-password',
  });
});
it('signup requires email confirmation when no session is returned', async () => {
  state.mode = 'signup';
  state.signup.mockResolvedValue({ data: { session: null }, error: null });
  render(<AuthForm />);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'runner@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: 'a-long-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText(
    'Check your email to confirm your account before signing in.',
  );
});
it('submits a recovery request to the SDK with a local callback', async () => {
  state.mode = 'reset';
  state.reset.mockResolvedValue({ error: null });
  render(<AuthForm />);
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'runner@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send recovery link' }));
  await waitFor(() => expect(state.reset).toHaveBeenCalled());
  expect(state.reset.mock.calls[0][1].redirectTo).toContain(
    '/auth/callback?next=/app/settings?recovery=1',
  );
  await screen.findByText(
    'If this address has an account, a recovery link is on its way.',
  );
});
