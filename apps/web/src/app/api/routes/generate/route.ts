import { NextResponse } from 'next/server';
import { ApiError, context, failure } from '@/lib/api';
import { analyticsApi } from '@/lib/server/analytics';
import { hazardsNear } from '@/lib/server/hazards';
import { generateSchema } from '@/lib/routes/schema';
export const maxDuration = 60;
/** Workout-aware route generation. Rate limited per user (shared across instances). */
export async function POST(request: Request) {
  try {
    const { db } = await context(request);
    const parsed = generateSchema.safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? 'Invalid route request.',
      );
    const { data: allowed } = await db.rpc('hit_rate_limit', {
      p_action: 'route_generate',
      p_limit: 12,
      p_window_s: 600,
    });
    if (allowed === false)
      throw new ApiError(
        429,
        'Route generation is limited to 12 requests per 10 minutes.',
      );
    const { avoid_conditions, ...req } = parsed.data;
    const hazards = avoid_conditions
      ? await hazardsNear(db, req.lat, req.lon, req.distance_m / 2 + 1000)
      : [];
    const result = await analyticsApi(
      '/v1/routes/generate',
      { ...req, hazards },
      55000,
    );
    return NextResponse.json(
      { ...(result as object), hazards_considered: hazards.length },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
