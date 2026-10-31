import { requireUser } from '@/lib/session';
import { ConditionsView } from '@/components/conditions-view';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">KM Conditions</p>
        <h1 className="page-title">What&apos;s it like out there?</h1>
        <p className="muted">
          Runner reports and official City of Calgary closures, weighted by age,
          confirmations and reliability.
        </p>
      </header>
      <ConditionsView userId={user.id} />
    </div>
  );
}
