'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, ErrorState } from '@km/ui';
import { browserSupabase } from '@/lib/supabase/client';
import { configured } from '@/lib/env';
import { Brand } from './brand';
const schema = z.object({
  email: z.email(),
  password: z.string().min(12).max(128),
});
type Fields = z.infer<typeof schema>;
export function AuthForm() {
  const search = useSearchParams();
  const initial = search.get('mode');
  const [mode, setMode] = useState(
    initial === 'signup' ? 'signup' : initial === 'reset' ? 'reset' : 'login',
  );
  const [error, setError] = useState(
    search.has('error')
      ? 'The sign-in link expired or could not be verified. Please try again.'
      : '',
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(
      mode === 'reset' ? schema.extend({ password: z.string() }) : schema,
    ),
  });
  async function submit(values: Fields) {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const db = browserSupabase();
      const redirectTo = location.origin + '/auth/callback';
      if (mode === 'reset') {
        const { error } = await db.auth.resetPasswordForEmail(values.email, {
          redirectTo: redirectTo + '?next=/app/settings?recovery=1',
        });
        if (error) throw error;
        setMessage(
          'If this address has an account, a recovery link is on its way.',
        );
      } else if (mode === 'signup') {
        const { data, error } = await db.auth.signUp({
          ...values,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.session) location.assign('/onboarding');
        else
          setMessage(
            'Check your email to confirm your account before signing in.',
          );
      } else {
        const { error } = await db.auth.signInWithPassword(values);
        if (error) throw error;
        location.assign('/app');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to authenticate.');
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    try {
      const { error } = await browserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + '/auth/callback' },
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
      setBusy(false);
    }
  }
  return (
    <main id="main" className="auth stack">
      <Brand />
      <p className="eyebrow">Your next chapter starts here.</p>
      <h1>
        {mode === 'signup'
          ? 'Find your stride.'
          : mode === 'reset'
            ? 'Back on track.'
            : 'Welcome back.'}
      </h1>
      {!configured() ? (
        <ErrorState message="Supabase is not configured. Follow docs/LOCAL_SETUP.md to enable accounts." />
      ) : (
        <>
          <form className="stack" onSubmit={handleSubmit(submit)}>
            <label>
              Email
              <Input autoComplete="email" type="email" {...register('email')} />
              {errors.email && (
                <span className="field-error">{errors.email.message}</span>
              )}
            </label>
            {mode !== 'reset' && (
              <label>
                Password
                <Input
                  type="password"
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  {...register('password')}
                />
                <span className="muted">At least 12 characters.</span>
                {errors.password && (
                  <span className="field-error">{errors.password.message}</span>
                )}
              </label>
            )}
            {error && <ErrorState message={error} />}
            <Button disabled={busy} type="submit">
              {busy
                ? 'Contacting your account…'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send recovery link'
                    : 'Log in'}
            </Button>
          </form>
          {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && (
            <Button disabled={busy} variant="outline" onClick={google}>
              Continue with Google
            </Button>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
        </>
      )}
      <div className="row">
        <Button
          variant="ghost"
          onClick={() => {
            setMode(mode === 'signup' ? 'login' : 'signup');
            setError('');
            setMessage('');
          }}
        >
          {mode === 'signup'
            ? 'Already moving? Log in'
            : 'New here? Create an account'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setMode('reset');
            setError('');
          }}
        >
          Forgot password?
        </Button>
      </div>
      <p className="muted">
        By creating an account, you agree to our{' '}
        <Link href="/terms">terms</Link> and{' '}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </main>
  );
}
