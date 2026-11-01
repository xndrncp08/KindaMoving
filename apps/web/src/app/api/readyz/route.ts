import { deploymentErrors } from '@/lib/server/deployment';
import { cronAuthorized } from '@/lib/server/cron';
import { admin } from '@/lib/supabase/admin';
import { analytics } from '@/lib/server/analytics';
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return Response.json({ ok: false }, { status: 401 });
  if (deploymentErrors().length)
    return Response.json(
      { ok: false, check: 'configuration' },
      { status: 503 },
    );
  try {
    const db = admin();
    const { error } = await db
      .from('profiles')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error();
    await analytics('/readyz', { timeoutMs: 10000 });
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { ok: false, check: 'dependencies' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
