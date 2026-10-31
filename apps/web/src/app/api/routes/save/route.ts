import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { lineString, waypoints } from '@/lib/routes/schema';
/** Create or update a mapped route. Geometry is validated and its distance derived in SQL. */
export async function POST(request: Request) {
  try {
    const { db } = await context(request);
    const body = z
      .object({
        id: z.uuid().nullable().default(null),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).default(''),
        geometry: lineString,
        source: z.enum(['generated', 'drawn']),
        waypoints: waypoints.default([]),
        generation: z.record(z.string(), z.unknown()).nullable().default(null),
        validation: z.record(z.string(), z.unknown()).nullable().default(null),
      })
      .safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Invalid route.');
    const b = body.data;
    const { data, error } = await db.rpc('save_route', {
      p_id: b.id,
      p_title: b.title,
      p_description: b.description,
      p_geojson: b.geometry,
      p_source: b.source,
      p_waypoints: b.waypoints,
      p_generation: b.generation,
      p_validation: b.validation,
    });
    check(error);
    return NextResponse.json({ id: data }, { status: b.id ? 200 : 201 });
  } catch (e) {
    return failure(e);
  }
}
