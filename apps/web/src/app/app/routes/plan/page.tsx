import { requireUser } from '@/lib/session';
import { RoutePlanner } from '@/components/route-planner';
export const metadata = { title: 'Plan a Route' };
export default async function Page() {
  const { user } = await requireUser();
  return (
    <>
      {/* Map-first workspace: the heading names the page for assistive tech. */}
      <h1 className="sr-only">Plan a route</h1>
      <RoutePlanner userId={user.id} />
    </>
  );
}
