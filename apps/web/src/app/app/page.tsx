import { requireUser } from '@/lib/session';
import { Dashboard } from '@/components/dashboard';
export default async function Page() {
  const { user } = await requireUser();
  return <Dashboard userId={user.id} />;
}
