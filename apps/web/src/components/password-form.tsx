'use client';
import { useState } from 'react';
import { Button, Input, ErrorState } from '@km/ui';
import { browserSupabase } from '@/lib/supabase/client';
import { toast } from 'sonner';
export function PasswordForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = e.currentTarget;
        const password = String(new FormData(form).get('password'));
        try {
          const { error } = await browserSupabase().auth.updateUser({
            password,
          });
          if (error) throw error;
          form.reset();
          toast.success('Password updated.');
        } catch (e) {
          setError(
            e instanceof Error ? e.message : 'Unable to update password.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        New password
        <Input
          type="password"
          name="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      {error && <ErrorState message={error} />}
      <Button variant="outline" disabled={busy}>
        Update password
      </Button>
    </form>
  );
}
