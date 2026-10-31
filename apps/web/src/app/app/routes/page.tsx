import { Suspense } from 'react';
import { requireUser } from '@/lib/session';
import { ResourcePage } from '@/components/resource-page';
export default async function Page() {
  const { user } = await requireUser();
  return (
    <Suspense>
      <ResourcePage name="routes" userId={user.id} />
    </Suspense>
  );
}
