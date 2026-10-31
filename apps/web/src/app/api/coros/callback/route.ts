import { after, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';
import { complete, COOKIE, readFlow } from '@/lib/coros/connect';
import { kickJobs } from '@/lib/jobs/kick';
/**
 * OAuth redirect target. The sealed state cookie must match the `state`
 * parameter and the signed-in user; the cookie is single-use.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (status: string, reason?: string) => {
    const target = new URL('/app/settings', url.origin);
    target.searchParams.set('coros', status);
    if (reason) target.searchParams.set('reason', reason);
    const response = NextResponse.redirect(target);
    response.cookies.set(COOKIE, '', { path: '/api/coros', maxAge: 0 });
    return response;
  };
  const jar = await cookies();
  const flow = readFlow(jar.get(COOKIE)?.value);
  const { data } = await (await supabase()).auth.getUser();
  if (
    !flow ||
    !data.user ||
    flow.user !== data.user.id ||
    url.searchParams.get('state') !== flow.state
  )
    return back('error', 'state');
  if (url.searchParams.get('error'))
    return back(
      'error',
      url.searchParams.get('error') === 'access_denied' ? 'denied' : 'provider',
    );
  const code = url.searchParams.get('code');
  if (!code) return back('error', 'code');
  try {
    await complete(admin(), flow, code);
    after(() => kickJobs(['coros_sync']));
    return back('connected');
  } catch (e) {
    console.error(
      '[coros] callback failed',
      e instanceof Error ? e.message : e,
    );
    return back('error', 'exchange');
  }
}
