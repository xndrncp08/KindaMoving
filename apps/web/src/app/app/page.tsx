import { cookies } from 'next/headers';
import { HydrationBoundary } from '@tanstack/react-query';
import { requireUser } from '@/lib/session';
import { prefetch } from '@/lib/server/prefetch';
import { Dashboard } from '@/components/dashboard';
import { today } from '@/lib/metrics';

/** A cookie value accepted only if Intl understands it. */
function valid(value: string | undefined, check: (v: string) => unknown) {
  if (!value || value.length > 64) return undefined;
  try {
    check(value);
    return value;
  } catch {
    return undefined;
  }
}
export default async function Page() {
  const { db, user } = await requireUser();
  const jar = await cookies();
  const zone = valid(
    jar.get('km-tz')?.value,
    (z) => new Intl.DateTimeFormat('en', { timeZone: z }),
  );
  const locale = valid(jar.get('km-locale')?.value, (l) =>
    Intl.getCanonicalLocales(l),
  );
  const state = await prefetch(db, user.id, {
    lists: ['activities', 'workouts', 'shoes'],
    profile: true,
  });
  return (
    <HydrationBoundary state={state}>
      <Dashboard
        userId={user.id}
        zone={zone}
        locale={locale}
        serverToday={zone ? today(zone) : undefined}
      />
    </HydrationBoundary>
  );
}
