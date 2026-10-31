import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, user } = await requireUser();
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (error)
    throw new Error('Unable to load your profile. Check database migrations.');
  if (!data) redirect('/onboarding');
  return <Shell userId={user.id}>{children}</Shell>;
}
