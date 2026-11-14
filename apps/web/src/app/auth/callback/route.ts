import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/env';
import type { LinkProblem } from '@/lib/auth-errors';
const otpTypes = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const fail = (problem: LinkProblem) =>
    NextResponse.redirect(new URL(`/login?error=${problem}`, url.origin));
  // Provider/verify errors arrive as query params (expired email links, cancelled OAuth consent).
  if (params.has('error'))
    return fail(
      params.get('error_code') === 'otp_expired'
        ? 'expired'
        : params.get('error') === 'access_denied'
          ? 'cancelled'
          : 'expired',
    );
  const type = params.get('type');
  const tokenHash = params.get('token_hash');
  const code = params.get('code');
  const next = safeNext(
    params.get('next') ?? (type === 'recovery' ? '/auth/reset' : null),
  );
  const db = await supabase();
  if (tokenHash && type && otpTypes.includes(type)) {
    // Email templates using {{ .TokenHash }} work on any device; PKCE codes need the requesting browser.
    const { error } = await db.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    return error
      ? fail('expired')
      : NextResponse.redirect(new URL(next, url.origin));
  }
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return fail(
      error.code === 'pkce_code_verifier_not_found' ? 'device' : 'expired',
    );
  }
  return fail('expired');
}
