/** Plain-language auth failures. Supabase messages can leak account state or read as jargon, so unknown codes fall back to a generic line. */
export type AuthProblem = { message: string; unconfirmed?: boolean };
export function authProblem(error: unknown): AuthProblem {
  const e = (error ?? {}) as { code?: string; status?: number; name?: string };
  if (e.name === 'AuthRetryableFetchError' || error instanceof TypeError)
    return {
      message:
        'We couldn’t reach KindaMoving. Check your connection and try again.',
    };
  if (
    e.status === 429 ||
    e.code === 'over_request_rate_limit' ||
    e.code === 'over_email_send_rate_limit'
  )
    return {
      message: 'Too many attempts. Wait a minute, then try again.',
    };
  switch (e.code) {
    case 'invalid_credentials':
      return {
        message:
          'That email and password don’t match. Check both, or reset your password.',
      };
    case 'email_not_confirmed':
      return {
        message:
          'Confirm your email address first. We can send the link again.',
        unconfirmed: true,
      };
    case 'weak_password':
      return {
        message:
          'Choose a stronger password: longer, and not one used on other sites.',
      };
    case 'same_password':
      return { message: 'Choose a password you haven’t used here before.' };
    case 'reauthentication_needed':
      return {
        message:
          'For security, log out and back in, then change your password.',
      };
    // Supabase's built-in mailer only delivers to project team addresses until custom SMTP is set up.
    case 'email_address_not_authorized':
      return {
        message:
          'We can’t send email to this address yet. Try again later, or contact support.',
      };
    case 'signup_disabled':
      return { message: 'New accounts are paused right now.' };
    case 'session_not_found':
    case 'refresh_token_not_found':
      return {
        message: 'Your session has ended. Log in again to continue.',
      };
  }
  return { message: 'Something went wrong. Please try again.' };
}

/** Messages for `/login?error=…`, set by the auth callback. Copy never says whether an account exists. */
export const linkProblems = {
  expired:
    'That link has expired or was already used. Log in, or choose “Forgot password?” for a new one.',
  device:
    'That link couldn’t sign you in here. Open it in the browser where you requested it, or log in below.',
  cancelled: 'Google sign-in was cancelled. Choose another way to continue.',
  session: 'Your session has ended. Log in again to continue.',
} as const;
export type LinkProblem = keyof typeof linkProblems;
