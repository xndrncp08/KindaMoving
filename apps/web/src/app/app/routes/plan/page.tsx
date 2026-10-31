import { requireUser } from '@/lib/session';
import { RoutePlanner } from '@/components/route-planner';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">KM Routes</p>
        <h1 className="page-title">Plan a route for the workout.</h1>
        <p className="muted">
          Routes come only from mapped runnable ways (OpenStreetMap). Crossings,
          climbing and reported conditions are counted and explained, never
          assumed away.
        </p>
      </header>
      <RoutePlanner userId={user.id} />
    </div>
  );
}
