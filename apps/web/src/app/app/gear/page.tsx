import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ResourcePage } from '@/components/resource-page';
import { GearOverview } from '@/components/gear-overview';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <div className="stack">
      <Suspense>
        <ResourcePage name="shoes" userId={user.id} />
      </Suspense>
      <GearOverview userId={user.id} />
    </div>
  );
}
