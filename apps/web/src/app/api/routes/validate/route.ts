import { NextResponse } from 'next/server';
import { ApiError, context, failure } from '@/lib/api';
import { analyticsApi } from '@/lib/server/analytics';
import { lineString } from '@/lib/routes/schema';
/** Checks that a line follows mapped runnable ways; reports jumps and off-network sections. */
export async function POST(request: Request) {
  try {
    await context(request);
    const body = lineString.safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Provide a GeoJSON LineString.');
    return NextResponse.json(
      await analyticsApi('/v1/routes/validate', {
        coordinates: body.data.coordinates,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
