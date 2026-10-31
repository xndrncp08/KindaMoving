import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/components/profile-form';
import { PasswordForm } from '@/components/password-form';
import { Card } from '@km/ui';
import { CorosCard } from '@/components/coros-card';
import { AccountData } from '@/components/account-data';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">The details, sorted</p>
        <h1 className="page-title">Your settings.</h1>
        <p className="muted">Signed in as {user.email}</p>
      </header>
      <Card>
        <h2>Profile & preferences</h2>
        <ProfileForm userId={user.id} />
      </Card>
      <Card>
        <h2>Password</h2>
        <PasswordForm />
      </Card>
      <Card>
        <h2>Your data</h2>
        <AccountData />
      </Card>
      <Card>
        <h2>Connected devices</h2>
        <CorosCard userId={user.id} />
      </Card>
    </div>
  );
}
