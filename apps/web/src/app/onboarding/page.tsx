import { requireUser } from '@/lib/session';
import { ProfileForm } from '@/components/profile-form';
import { Brand } from '@/components/brand';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <main id="main" className="legal stack">
      <Brand />
      <p className="eyebrow">First, the easy questions.</p>
      <h1>Run your own way.</h1>
      <p className="muted">
        Tell us a little about your running. You can change all of this later.
      </p>
      <ProfileForm userId={user.id} onboarding />
    </main>
  );
}
