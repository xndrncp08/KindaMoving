import { Brand } from '@/components/brand';
export const metadata = { title: 'Privacy' };
export default function Page() {
  return (
    <main id="main" className="legal">
      <Brand />
      <h1 style={{ marginTop: 40 }}>Privacy</h1>
      <p className="eyebrow">
        Draft for operator legal review · November 1, 2026
      </p>
      <p>
        KindaMoving stores your account email with Supabase Auth, your profile
        preferences, and the running records and files you choose to add. Runs,
        routes, training plans and form videos are private to your account;
        enabling a public-profile preference does not publish them. Condition
        reports are public by design, shown under a daily pseudonym, and are
        deleted with your account. Uploaded activity files may contain sensitive
        location data. Weather lookups send coordinates rounded to about 1 km to
        Open-Meteo. If you connect COROS, its access tokens are stored encrypted
        and are never exported or shown. Form-analysis originals are deleted
        after analysis and annotated, face-blurred copies after 7 days. No
        advertising or analytics trackers are installed. Browser preferences
        such as theme are stored on your device.
      </p>
      <p>
        You can download all of your data as JSON, or delete your account and
        everything in it, from Settings → Your data. Before public launch, the
        operator must publish a support contact, retention schedule, hosting
        regions and jurisdiction-specific disclosures.
      </p>
    </main>
  );
}
