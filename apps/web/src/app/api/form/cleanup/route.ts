import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { cronAuthorized } from '@/lib/server/cron';
/** Retention: remove annotated videos past expiry (cron, CRON_SECRET). Metrics are kept. */
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const db = admin();
  const { data, error } = await db
    .from('form_analyses')
    .select('id,annotated_path')
    .lt('expires_at', new Date().toISOString())
    .not('annotated_path', 'is', null)
    .limit(500);
  if (error)
    return NextResponse.json(
      { error: 'Retention query failed.' },
      { status: 503 },
    );
  const paths = (data ?? []).map((r) => r.annotated_path as string);
  if (paths.length) {
    const { error } = await db.storage.from('form-results').remove(paths);
    if (error)
      return NextResponse.json(
        { error: 'Retention storage deletion failed.' },
        { status: 503 },
      );
  }
  if (data?.length) {
    const { error } = await db
      .from('form_analyses')
      .update({ annotated_path: null })
      .in(
        'id',
        data.map((r) => r.id),
      );
    if (error)
      return NextResponse.json(
        { error: 'Retention metadata update failed.' },
        { status: 503 },
      );
  }
  return NextResponse.json({ removed: paths.length });
}
