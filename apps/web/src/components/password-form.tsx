'use client';
import { useState } from 'react';
import { Button, ErrorState } from '@km/ui';
import { browserSupabase } from '@/lib/supabase/client';
import { authProblem } from '@/lib/auth-errors';
import { toast } from 'sonner';
import { PasswordField } from './password-field';
/** Settings password change, or (with `recovery`) the final step of a reset link. */
export function PasswordForm({
  recovery,
  email,
}: {
  recovery?: boolean;
  email?: string;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={recovery ? 'auth-form' : 'stack'}
      method="post"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = e.currentTarget;
        const password = String(new FormData(form).get('password'));
        const db = browserSupabase();
        const { error } = await db.auth.updateUser({ password });
        if (error) {
          setError(authProblem(error).message);
          setBusy(false);
          return;
        }
        if (recovery) {
          // A reset may follow a compromise: end every session, then prove the new password works.
          await db.auth.signOut({ scope: 'global' });
          location.assign('/login?reset=done');
          return;
        }
        form.reset();
        setBusy(false);
        toast.success('Password updated.');
      }}
    >
      {/* Lets password managers file the new password under the right account. */}
      {email && (
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          hidden
        />
      )}
      <PasswordField
        label="New password"
        name="password"
        minLength={12}
        maxLength={128}
        autoComplete="new-password"
        enterKeyHint="done"
        aria-describedby="new-password-hint"
        required
      />
      <p id="new-password-hint" className="field-hint">
        12 or more characters. A short phrase works well.
      </p>
      {error && <ErrorState message={error} />}
      <Button variant={recovery ? 'default' : 'outline'} disabled={busy}>
        {busy ? 'Saving…' : recovery ? 'Save Password' : 'Update Password'}
      </Button>
    </form>
  );
}
