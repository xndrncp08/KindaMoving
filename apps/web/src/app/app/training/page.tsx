import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ResourcePage } from '@/components/resource-page';
import { TrainingOverview } from '@/components/training-overview';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <Suspense>
      <ResourcePage
        name="workouts"
        userId={user.id}
        intro={<TrainingOverview userId={user.id} />}
      />
    </Suspense>
  );
}
