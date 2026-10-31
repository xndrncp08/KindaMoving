import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { CompareRuns } from '@/components/compare-runs';
import { EmptyState } from '@km/ui';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { user } = await requireUser();
  const { a, b } = await searchParams;
  const ids = z.tuple([z.uuid(), z.uuid()]).safeParse([a, b]);
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">KM Analyze</p>
        <h1 className="page-title">Compare two runs.</h1>
      </header>
      {ids.success ? (
        <CompareRuns userId={user.id} a={ids.data[0]} b={ids.data[1]} />
      ) : (
        <EmptyState title="Pick two runs">
          Select two activities with Compare on the Activities page.
        </EmptyState>
      )}
    </div>
  );
}
