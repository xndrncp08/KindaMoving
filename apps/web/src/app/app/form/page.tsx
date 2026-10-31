import { requireUser } from '@/lib/session';
import { FormAnalysis } from '@/components/form-analysis';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">KM Form</p>
        <h1 className="page-title">A closer look at your stride.</h1>
        <p className="muted">
          Approximate pose-based observations from a single video, not a
          clinical or biomechanical assessment.
        </p>
      </header>
      <FormAnalysis userId={user.id} />
    </div>
  );
}
