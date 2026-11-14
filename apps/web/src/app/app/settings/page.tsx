import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/components/profile-form';
import { PasswordForm } from '@/components/password-form';
import { CorosCard } from '@/components/coros-card';
import { AccountData } from '@/components/account-data';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <h1 className="page-title">Settings</h1>
        <p className="muted">Signed in as {user.email}</p>
      </header>
      <section className="settings-section">
        <h2>Profile & preferences</h2>
        <ProfileForm userId={user.id} />
      </section>
      <section className="settings-section">
        <h2>Connected devices</h2>
        <CorosCard userId={user.id} />
      </section>
      <details className="disclosure">
        <summary>Change password</summary>
        <PasswordForm />
      </details>
      <details className="disclosure">
        <summary>Your data & account</summary>
        <AccountData />
      </details>
    </div>
  );
}
