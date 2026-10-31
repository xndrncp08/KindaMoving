import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { kickJobs } from '@/lib/jobs/kick';
/**
 * Queue an upload of this route to the user's COROS account. Requires an explicit
 * `confirm: true` from a confirmation dialog: this mutates an external account.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Route not found.');
    const { db, user } = await context(request);
    const body = z
      .object({ confirm: z.literal(true) })
      .safeParse(await request.json().catch(() => ({})));
    if (!body.success)
      throw new ApiError(
        400,
        'Confirmation is required before sending to COROS.',
      );
    const { data: account } = await db
      .from('connected_provider_accounts')
      .select('status,capabilities')
      .eq('user_id', user.id)
      .eq('provider', 'coros')
      .maybeSingle();
    if (account?.status !== 'connected')
      throw new ApiError(409, 'Connect COROS in Settings first.');
    if (!(account.capabilities as string[]).includes('uploadRouteFile'))
      throw new ApiError(
        409,
        'Your COROS connection does not offer route import.',
      );
    const { data: route } = await db
      .from('routes')
      .select('id,updated_at')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!route) throw new ApiError(404, 'Route not found.');
    // Keyed by route version: re-sending an unchanged route is a no-op, an edited route is new.
    const { data, error } = await db.rpc('enqueue_job', {
      p_kind: 'coros_route_push',
      p_payload: { route_id: route.id },
      p_key: `${route.id}@${route.updated_at}`,
    });
    check(error);
    after(() => kickJobs(['coros_route_push']));
    return NextResponse.json({ job_id: data });
  } catch (e) {
    return failure(e);
  }
}
