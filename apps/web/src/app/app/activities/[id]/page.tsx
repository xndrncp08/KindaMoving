import { HydrationBoundary } from '@tanstack/react-query';
import { requireUser } from '@/lib/session';
import { prefetch } from '@/lib/server/prefetch';
import { Detail } from '@/components/detail';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db, user } = await requireUser();
  const { id } = await params;
  const state = await prefetch(db, user.id, {
    profile: true,
    detail: ['activities', id],
  });
  return (
    <HydrationBoundary state={state}>
      <Detail name="activities" id={id} userId={user.id} />
    </HydrationBoundary>
  );
}
