import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, it, expect, vi, describe } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
const state = vi.hoisted(() => ({
  query: 'mode=login',
  reset: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  resend: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock('@/lib/env', async (actual) => ({
  ...(await actual<typeof import('@/lib/env')>()),
  configured: () => true,
}));
vi.mock('@/lib/supabase/client', () => ({
  browserSupabase: () => ({
    auth: {
      resetPasswordForEmail: state.reset,
      signUp: state.signup,
      signInWithPassword: state.login,
      resend: state.resend,
    },
  }),
}));
import { AuthForm } from '@/components/auth-form';
import { authProblem } from '@/lib/auth-errors';
const apiError = (code: string, status = 400) =>
  Object.assign(new Error('raw ' + code), { code, status });
beforeEach(() => {
  vi.stubGlobal('location', {
    origin: 'https://km.test',
    assign: state.assign,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function fill(email: string, password?: string, confirm?: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  if (password !== undefined)
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: password },
    });
  if (confirm !== undefined)
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: confirm },
    });
}

it('explains a failed login without echoing the raw provider message', async () => {
  state.query = 'mode=login';
  state.login.mockResolvedValue({ error: apiError('invalid_credentials') });
  render(<AuthForm />);
  fill('runner@example.test', 'short');
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  await screen.findByText(/That email and password don’t match/);
  expect(screen.queryByText(/raw/)).toBeNull();
  // Login does not enforce the signup length rule.
  expect(state.login).toHaveBeenCalledWith({
    email: 'runner@example.test',
    password: 'short',
  });
  expect(state.assign).not.toHaveBeenCalled();
});

it('returns to the protected page that sent the runner to login', async () => {
  state.query = 'next=%2Fapp%2Froutes%3Fstart%3D1';
  state.login.mockResolvedValue({ error: null });
  render(<AuthForm />);
  fill('runner@example.test', 'a-long-password');
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  await waitFor(() =>
    expect(state.assign).toHaveBeenCalledWith('/app/routes?start=1'),
  );
  // Stays busy until navigation, so it cannot be submitted twice.
  expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
});

it('never redirects off-site from a crafted next parameter', async () => {
  state.query = 'next=%2F%09%2Fevil.test';
  state.login.mockResolvedValue({ error: null });
  render(<AuthForm />);
  fill('runner@example.test', 'a-long-password');
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  await waitFor(() => expect(state.assign).toHaveBeenCalledWith('/app'));
});

it('offers to resend confirmation when the email is unconfirmed', async () => {
  state.query = '';
  state.login.mockResolvedValue({ error: apiError('email_not_confirmed') });
  state.resend.mockResolvedValue({ error: null });
  render(<AuthForm />);
  fill('runner@example.test', 'a-long-password');
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resend Confirmation Email' }),
  );
  await screen.findByRole('heading', { name: 'Check your inbox.' });
  expect(state.resend).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'signup', email: 'runner@example.test' }),
  );
});

it('validates the signup password before contacting the provider', async () => {
  state.query = 'mode=signup';
  render(<AuthForm />);
  fill('runner@example.test', 'no digits here at all', 'different');
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  await screen.findByText('Meet every requirement below.');
  await screen.findByText('Passwords don’t match.');
  expect(state.signup).not.toHaveBeenCalled();
  // The checklist names exactly what is missing.
  expect(screen.getByText('12 or more characters').closest('li')).toHaveClass(
    'met',
  );
  expect(screen.getByText('A number').closest('li')).not.toHaveClass('met');
  expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});

describe('signup confirmation', () => {
  it.each([
    ['a new address', { data: { session: null }, error: null }],
    [
      'an existing address',
      { data: { session: null }, error: apiError('user_already_exists') },
    ],
  ])('responds identically for %s', async (_, response) => {
    state.query = 'mode=signup';
    state.signup.mockResolvedValue(response);
    render(<AuthForm />);
    fill('runner@example.test', 'long run sunday 7', 'long run sunday 7');
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await screen.findByRole('heading', { name: 'Check your inbox.' });
    expect(
      screen.getByRole('button', { name: /Resend in \d+s/ }),
    ).toBeDisabled();
    expect(state.signup.mock.calls[0][0]).not.toHaveProperty('confirm');
    expect(state.signup.mock.calls[0][0].options.emailRedirectTo).toBe(
      'https://km.test/auth/callback?next=%2Fapp',
    );
  });
});

it('sends recovery links to the dedicated reset screen', async () => {
  state.query = 'mode=reset';
  state.reset.mockResolvedValue({ error: null });
  render(<AuthForm />);
  fill('runner@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));
  await screen.findByRole('heading', { name: 'Check your inbox.' });
  expect(state.reset.mock.calls[0][1].redirectTo).toBe(
    'https://km.test/auth/callback?next=%2Fauth%2Freset',
  );
  expect(screen.getByText(/has an account, a link/)).toBeInTheDocument();
});

it('shows a recovery path for an expired callback link', () => {
  state.query = 'error=expired';
  render(<AuthForm />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    /expired or was already used/,
  );
});

it('toggles password visibility without renaming the field', () => {
  state.query = '';
  render(<AuthForm />);
  const input = screen.getByLabelText('Password', { exact: true });
  expect(input).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

describe('authProblem', () => {
  it.each([
    [apiError('over_email_send_rate_limit', 429), /Too many attempts/],
    [{ status: 429 }, /Too many attempts/],
    [{ name: 'AuthRetryableFetchError' }, /couldn’t reach/],
    [new TypeError('Failed to fetch'), /couldn’t reach/],
    [apiError('weak_password', 422), /stronger password/],
    [apiError('something_new'), /Something went wrong/],
  ])('maps %o', (error, message) =>
    expect(authProblem(error).message).toMatch(message),
  );
});
