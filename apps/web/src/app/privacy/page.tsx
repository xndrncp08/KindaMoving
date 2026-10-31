import { Brand } from '@/components/brand';
export const metadata = { title: 'Privacy' };
export default function Page() {
  return (
    <main id="main" className="legal">
      <Brand />
      <h1 style={{ marginTop: 40 }}>Privacy</h1>
      <p className="eyebrow">Foundation release · October 31, 2026</p>
      <p>
        KindaMoving stores your account email with Supabase Auth, your profile
        preferences, and the running records and files you choose to add. Your
        running records are private to your account in Phase 1. Enabling a
        public-profile preference does not publish them. Browser preferences
        such as theme are stored on your device. Uploaded activity files may
        contain sensitive location data. No advertising or analytics trackers
        are installed in this foundation. Email notifications are a saved
        preference; delivery is not implemented. To remove an activity, use its
        delete action. Account deletion and data export require operator
        assistance in Phase 1. Before public launch, the operator must publish a
        support contact, retention schedule, hosting regions, and
        jurisdiction-specific disclosures.
      </p>
    </main>
  );
}
