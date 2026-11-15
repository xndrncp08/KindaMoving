'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, MailCheck } from 'lucide-react';
import { Button, Input, ErrorState } from '@km/ui';
import { browserSupabase } from '@/lib/supabase/client';
import { configured, safeNext } from '@/lib/env';
import {
  authProblem,
  linkProblems,
  type AuthProblem,
  type LinkProblem,
} from '@/lib/auth-errors';
import { AuthShell } from './auth-shell';
import { PasswordField } from './password-field';
import { PasswordRules } from './password-rules';
import { newPassword } from '@/lib/password';

type Mode = 'login' | 'signup' | 'reset';
const email = z.email({
  error: 'Enter an email address like name@example.com.',
});
const schemas = {
  // Login never enforces the signup policy: older accounts may predate it, and it hints at the rule.
  login: z.object({
    email,
    password: z.string().min(1, { error: 'Enter your password.' }),
  }),
  signup: z
    .object({ email, password: newPassword, confirm: z.string() })
    .refine((v) => v.password === v.confirm, {
      path: ['confirm'],
      error: 'Passwords don’t match.',
    }),
  reset: z.object({ email }),
};
type Fields = { email: string; password: string; confirm: string };
const copy = {
  login: {
    title: 'Welcome back.',
    lead: 'Log in to pick up where you left off.',
    submit: 'Log In',
    busy: 'Logging in…',
  },
  signup: {
    title: 'Find your stride.',
    lead: 'Log runs, plan routes and keep an honest record of your shoes.',
    submit: 'Create Account',
    busy: 'Creating account…',
  },
  reset: {
    title: 'Reset your password.',
    lead: 'Enter your account email and we’ll send a link to choose a new password.',
    submit: 'Send Reset Link',
    busy: 'Sending link…',
  },
} as const;
const RESEND_AFTER_S = 60;

export function AuthForm() {
  const search = useSearchParams();
  const param = search.get('mode');
  const mode: Mode = param === 'signup' || param === 'reset' ? param : 'login';
  const next = search.get('next');
  const link = search.get('error') as LinkProblem | null;
  // Mode links keep `next` so a protected destination survives switching screens.
  const href = (m: Mode) => {
    const q = new URLSearchParams();
    if (m !== 'login') q.set('mode', m);
    if (next) q.set('next', next);
    return `/login${q.size ? '?' + q : ''}`;
  };
  // State is tagged with its mode so Back/forward never shows another screen's result.
  const [problem, setProblem] = useState<(AuthProblem & { mode: Mode }) | null>(
    null,
  );
  const [sent, setSent] = useState<{
    kind: 'signup' | 'reset';
    from: Mode;
    to: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<Fields>({
    // Validate once a field is left, then live while correcting it — not while first typing.
    mode: 'onTouched',
    defaultValues: { email: '', password: '', confirm: '' },
    resolver: zodResolver(schemas[mode]) as never,
  });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form;
  const callback = (path: string) =>
    `${location.origin}/auth/callback?next=${encodeURIComponent(path)}`;

  async function send(kind: 'signup' | 'reset', address: string) {
    const db = browserSupabase();
    const { error } =
      kind === 'reset'
        ? await db.auth.resetPasswordForEmail(address, {
            redirectTo: callback('/auth/reset'),
          })
        : await db.auth.resend({
            type: 'signup',
            email: address,
            options: { emailRedirectTo: callback(safeNext(next)) },
          });
    if (error) throw error;
  }

  async function submit(values: Fields) {
    setProblem(null);
    setBusy(true);
    try {
      const db = browserSupabase();
      if (mode === 'reset') {
        await send('reset', values.email);
        setSent({ kind: mode, from: mode, to: values.email });
      } else if (mode === 'signup') {
        const { data, error } = await db.auth.signUp({
          email: values.email,
          password: values.password,
          options: { emailRedirectTo: callback(safeNext(next)) },
        });
        // An existing address gets the same response as a new one (no account enumeration).
        if (error && error.code !== 'user_already_exists') throw error;
        if (data.session) {
          location.assign('/onboarding');
          return; // stay busy until the page changes
        }
        setSent({ kind: mode, from: mode, to: values.email });
      } else {
        const { error } = await db.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        location.assign(safeNext(next));
        return;
      }
    } catch (e) {
      setProblem({ ...authProblem(e), mode });
    }
    setBusy(false);
  }

  async function google() {
    setProblem(null);
    setBusy(true);
    const { error } = await browserSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback(safeNext(next)) },
    });
    // Success leaves the page for Google; only failures return here.
    if (error) {
      setProblem({ ...authProblem(error), mode });
      setBusy(false);
    }
  }

  const shownProblem = problem?.mode === mode ? problem : null;
  const shownSent = sent?.from === mode ? sent : null;
  const text = copy[mode];
  const [password, confirm] = useWatch({
    control,
    name: ['password', 'confirm'],
  });

  return (
    <AuthShell
      legal={
        mode === 'signup' && !shownSent ? (
          <>
            By creating an account, you agree to the{' '}
            <Link href="/terms">Terms</Link> and{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </>
        ) : undefined
      }
      pitch={
        mode === 'signup' ? (
          <div className="auth-pitch">
            <h2>Everything your running needs. Nothing it doesn’t.</h2>
            <ul>
              {[
                'Import runs from COROS, GPX or FIT files',
                'Routes on mapped, runnable ways',
                'Training plans matched to the runs you do',
                'Honest mileage for every pair of shoes',
              ].map((t) => (
                <li key={t}>
                  <Check aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : undefined
      }
    >
      {shownSent ? (
        <Sent
          kind={shownSent.kind}
          to={shownSent.to}
          resend={() => send(shownSent.kind, shownSent.to)}
          back={href(shownSent.kind === 'signup' ? 'signup' : 'login')}
          login={href('login')}
        />
      ) : (
        <>
          <header className="auth-head">
            <h1>{text.title}</h1>
            <p className="muted">{text.lead}</p>
          </header>
          {!configured() ? (
            <ErrorState message="Supabase is not configured. Follow docs/LOCAL_SETUP.md to enable accounts." />
          ) : (
            <>
              {search.get('reset') === 'done' && mode === 'login' && (
                <p role="status" className="notice">
                  Password updated. Log in with your new password.
                </p>
              )}
              {link && link in linkProblems && (
                <p role="alert" className="notice warn">
                  {linkProblems[link]}
                </p>
              )}
              <form
                className="auth-form"
                method="post"
                noValidate
                aria-busy={busy}
                onSubmit={handleSubmit(submit)}
              >
                <label>
                  Email
                  <Input
                    type="email"
                    autoComplete={mode === 'reset' ? 'email' : 'username'}
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint={mode === 'reset' ? 'send' : 'next'}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    {...register('email')}
                  />
                </label>
                {errors.email && (
                  <p id="email-error" className="field-error">
                    {errors.email.message}
                  </p>
                )}
                {mode !== 'reset' && (
                  <>
                    <PasswordField
                      label="Password"
                      autoComplete={
                        mode === 'signup' ? 'new-password' : 'current-password'
                      }
                      enterKeyHint={mode === 'signup' ? 'next' : 'go'}
                      aria-invalid={!!errors.password}
                      aria-describedby={
                        [
                          errors.password && 'password-error',
                          mode === 'signup' && 'password-rules',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      {...register('password')}
                    />
                    {errors.password && (
                      <p id="password-error" className="field-error">
                        {errors.password.message}
                      </p>
                    )}
                    {mode === 'signup' && (
                      <>
                        <PasswordField
                          label="Confirm password"
                          autoComplete="new-password"
                          enterKeyHint="go"
                          aria-invalid={!!errors.confirm}
                          aria-describedby={
                            errors.confirm ? 'confirm-error' : undefined
                          }
                          {...register('confirm')}
                        />
                        {errors.confirm && (
                          <p id="confirm-error" className="field-error">
                            {errors.confirm.message}
                          </p>
                        )}
                        <PasswordRules
                          id="password-rules"
                          password={password}
                          confirm={confirm}
                        />
                      </>
                    )}
                    {mode === 'login' && (
                      <Link className="auth-aside-link" href={href('reset')}>
                        Forgot password?
                      </Link>
                    )}
                  </>
                )}
                {shownProblem && (
                  <div role="alert" className="error">
                    <p>{shownProblem.message}</p>
                    {shownProblem.unconfirmed && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          const to = form.getValues('email');
                          setBusy(true);
                          try {
                            await send('signup', to);
                            setSent({ kind: 'signup', from: mode, to });
                          } catch (e) {
                            setProblem({ ...authProblem(e), mode });
                          }
                          setBusy(false);
                        }}
                      >
                        Resend Confirmation Email
                      </Button>
                    )}
                  </div>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? text.busy : text.submit}
                </Button>
              </form>
              {mode !== 'reset' &&
                process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && (
                  <>
                    <p className="auth-divider">
                      <span>or</span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="google"
                      disabled={busy}
                      onClick={google}
                    >
                      <GoogleMark />
                      Continue with Google
                    </Button>
                  </>
                )}
            </>
          )}
          <p className="auth-switch">
            {mode === 'login' ? (
              <>
                New to KindaMoving?{' '}
                <Link href={href('signup')}>Create an account</Link>
              </>
            ) : mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <Link href={href('login')}>Log in</Link>
              </>
            ) : (
              <>
                Remembered it? <Link href={href('login')}>Back to log in</Link>
              </>
            )}
          </p>
        </>
      )}
    </AuthShell>
  );
}

function Sent({
  kind,
  to,
  resend,
  back,
  login,
}: {
  kind: 'signup' | 'reset';
  to: string;
  resend: () => Promise<void>;
  back: string;
  login: string;
}) {
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>(
    'idle',
  );
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <>
      <header className="auth-head">
        <MailCheck className="auth-icon" aria-hidden="true" />
        <h1>Check your inbox.</h1>
        <p className="muted" role="status">
          {kind === 'signup' ? (
            <>
              If <strong className="auth-email">{to}</strong> is new to
              KindaMoving, a confirmation link is on its way. Open it on this
              device to finish setting up.
            </>
          ) : (
            <>
              If <strong className="auth-email">{to}</strong> has an account, a
              link to choose a new password is on its way. It works once.
            </>
          )}
        </p>
      </header>
      <p className="muted">
        Nothing after a few minutes? Check spam, or send it again.
      </p>
      {state !== 'idle' && state !== 'sending' && state !== 'sent' && (
        <ErrorState message={state} />
      )}
      <div className="auth-actions">
        <Button
          type="button"
          variant="outline"
          disabled={wait > 0 || state === 'sending'}
          onClick={async () => {
            setState('sending');
            try {
              await resend();
              setState('sent');
              setWait(RESEND_AFTER_S);
            } catch (e) {
              setState(authProblem(e).message);
            }
          }}
        >
          {state === 'sending'
            ? 'Sending…'
            : wait > 0
              ? `Resend in ${wait}s`
              : 'Resend Email'}
        </Button>
        {state === 'sent' && (
          <p role="status" className="field-hint met">
            <Check aria-hidden="true" /> Sent again.
          </p>
        )}
      </div>
      <p className="auth-switch">
        {kind === 'signup' ? (
          <>
            Wrong address? <Link href={back}>Use a different email</Link>
            <br />
            Already have an account? <Link href={login}>Log in</Link>
          </>
        ) : (
          <Link href={login}>Back to log in</Link>
        )}
      </p>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
