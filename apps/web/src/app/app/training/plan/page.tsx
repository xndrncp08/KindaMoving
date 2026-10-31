import { requireUser } from '@/lib/session';
import { PlanBuilder } from '@/components/plan-builder';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">KM Train</p>
        <h1 className="page-title">Build toward race day.</h1>
        <p className="muted">
          A transparent plan from your own recent volume and best efforts. Every
          rule is listed under Training in the docs.
        </p>
      </header>
      <PlanBuilder userId={user.id} />
    </div>
  );
}
