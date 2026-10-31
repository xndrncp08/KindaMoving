import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ResourcePage } from '@/components/resource-page';
import { TrainingOverview } from '@/components/training-overview';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <TrainingOverview userId={user.id} />
      <Suspense>
        <ResourcePage name="workouts" userId={user.id} />
      </Suspense>
    </div>
  );
}
