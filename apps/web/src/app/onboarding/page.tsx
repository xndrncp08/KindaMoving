import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/components/profile-form';
import { AuthShell } from '@/components/auth-shell';
export const metadata = {
  title: 'Set up',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const { user } = await requireUser();
  return (
    <AuthShell>
      <header className="auth-head">
        <h1>Run your own way.</h1>
        <p className="muted">
          A few answers set up your week. Change any of them later in Settings.
        </p>
      </header>
      <ProfileForm userId={user.id} onboarding />
    </AuthShell>
  );
}
