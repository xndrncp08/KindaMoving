import { requireUser } from '@/lib/session';
import { Detail } from '@/components/detail';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireUser();
  const { id } = await params;
  return <Detail name="shoes" id={id} userId={user.id} />;
}
