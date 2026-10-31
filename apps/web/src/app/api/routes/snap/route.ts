import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure } from '@/lib/api';
import { analyticsApi } from '@/lib/server/analytics';
import { waypoints } from '@/lib/routes/schema';
/** Interactive editing: route through ordered waypoints on the mapped network. */
export async function POST(request: Request) {
  try {
    const { db } = await context(request);
    const body = z
      .object({
        waypoints: waypoints.min(2),
        surface: z.enum(['any', 'paved', 'unpaved']).default('any'),
      })
      .safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Provide 2–60 waypoints.');
    const { data: allowed } = await db.rpc('hit_rate_limit', {
      p_action: 'route_snap',
      p_limit: 120,
      p_window_s: 600,
    });
    if (allowed === false)
      throw new ApiError(429, 'Too many edits; slow down a little.');
    return NextResponse.json(await analyticsApi('/v1/routes/snap', body.data));
  } catch (e) {
    return failure(e);
  }
}
