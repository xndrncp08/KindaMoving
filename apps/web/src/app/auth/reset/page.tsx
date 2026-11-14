import Link from 'next/link';
import { Button } from '@km/ui';
import { AuthShell } from '@/components/auth-shell';
import { PasswordForm } from '@/components/password-form';
import { supabase } from '@/lib/supabase/server';
import { configured } from '@/lib/env';
export const metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page() {
  // The reset link's callback leaves a short-lived recovery session; without one the link is spent.
  const user = configured()
    ? (await (await supabase()).auth.getUser()).data.user
    : null;
  return (
    <AuthShell>
      {user ? (
        <>
          <header className="auth-head">
            <h1>Choose a new password.</h1>
            <p className="muted">
              For <strong className="auth-email">{user.email}</strong>. You’ll
              be logged out everywhere, then log in again with the new one.
            </p>
          </header>
          <PasswordForm recovery email={user.email} />
        </>
      ) : (
        <>
          <header className="auth-head">
            <h1>This link has expired.</h1>
            <p className="muted">
              Reset links work once and expire after a while. Request a new one
              and use it on this device.
            </p>
          </header>
          <div className="auth-actions">
            <Button asChild>
              <Link href="/login?mode=reset">Request a New Link</Link>
            </Button>
          </div>
          <p className="auth-switch">
            <Link href="/login">Back to log in</Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
