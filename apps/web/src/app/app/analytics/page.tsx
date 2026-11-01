import { requireUser } from '@/lib/session';
import { AnalyticsOverview } from '@/components/analytics-overview';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Review · KM Analyze</p>
        <h1 className="page-title">Trends</h1>
        <p className="muted">
          Volume, load, consistency and personal bests from your recorded runs.
        </p>
      </header>
      <AnalyticsOverview userId={user.id} />
    </div>
  );
}
