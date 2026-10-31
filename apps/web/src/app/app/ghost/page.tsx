import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { GhostReplay } from '@/components/ghost-replay';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { user } = await requireUser();
  const { a, b } = await searchParams;
  const id = (v?: string) => (z.uuid().safeParse(v).success ? v! : null);
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">KM Ghost</p>
        <h1 className="page-title">Race your past self.</h1>
      </header>
      <GhostReplay userId={user.id} a={id(a)} b={id(b)} />
    </div>
  );
}
