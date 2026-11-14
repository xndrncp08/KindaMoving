// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ supabase: async () => ({ auth }) }));
import { GET } from '@/app/auth/callback/route';
afterEach(() => vi.clearAllMocks());
const go = async (query: string) =>
  (
    await GET(new Request('https://km.test/auth/callback?' + query))
  ).headers.get('location');

it.each([
  ['error=access_denied&error_code=otp_expired', '/login?error=expired'],
  ['error=access_denied', '/login?error=cancelled'],
  ['error=server_error', '/login?error=expired'],
  ['', '/login?error=expired'],
])('turns provider errors into a recovery message: %s', async (q, to) =>
  expect(await go(q)).toBe('https://km.test' + to),
);

it('verifies a cross-device recovery link and opens the reset screen', async () => {
  auth.verifyOtp.mockResolvedValue({ error: null });
  expect(await go('token_hash=abc&type=recovery')).toBe(
    'https://km.test/auth/reset',
  );
  expect(auth.verifyOtp).toHaveBeenCalledWith({
    type: 'recovery',
    token_hash: 'abc',
  });
});

it('rejects unknown OTP types instead of verifying them', async () => {
  expect(await go('token_hash=abc&type=sms')).toBe(
    'https://km.test/login?error=expired',
  );
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});

it('explains a PKCE link opened in another browser', async () => {
  auth.exchangeCodeForSession.mockResolvedValue({
    error: { code: 'pkce_code_verifier_not_found' },
  });
  expect(await go('code=xyz')).toBe('https://km.test/login?error=device');
});

it('keeps the post-login destination on this origin', async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  expect(await go('code=xyz&next=%2Fapp%2Ftraining')).toBe(
    'https://km.test/app/training',
  );
  expect(await go('code=xyz&next=%2F%09%2Fevil.test')).toBe(
    'https://km.test/app',
  );
});
