import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { KINDS } from '@/lib/conditions';
import { conditionsNear } from '@/lib/server/conditions';
/** Scored conditions around a point. Reporter identities are never returned. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const p = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lon: z.coerce.number().min(-180).max(180),
        radius: z.coerce.number().min(100).max(20000).default(3000),
      })
      .safeParse(Object.fromEntries(q));
    if (!p.success) throw new ApiError(400, 'Invalid location.');
    const { db } = await context(request);
    const assessments = await conditionsNear(
      db,
      p.data.lat,
      p.data.lon,
      p.data.radius,
    );
    return NextResponse.json(
      {
        assessments,
        generated_at: new Date().toISOString(),
        note: 'No report is not the same as clear. Conditions change quickly.',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
const report = z.object({
  kind: z.enum(KINDS as [string, ...string[]]),
  severity: z.number().int().min(1).max(3),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  observed_at: z.iso.datetime({ offset: true }),
  description: z.string().trim().max(500).default(''),
  client_id: z.uuid(),
});
/** Submit a report. `client_id` makes offline retries idempotent; limits are enforced in SQL. */
export async function POST(request: Request) {
  try {
    const { db } = await context(request);
    const body = report.safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Invalid report.');
    const b = body.data;
    const { data, error } = await db.rpc('report_condition', {
      p_kind: b.kind,
      p_severity: b.severity,
      p_lat: b.lat,
      p_lon: b.lon,
      p_observed_at: b.observed_at,
      p_description: b.description,
      p_client_id: b.client_id,
    });
    if (error?.message.includes('limit'))
      throw new ApiError(429, 'Report limit reached; try again later.');
    if (error?.message.includes('72 hours'))
      throw new ApiError(400, 'Reports must describe the last 72 hours.');
    check(error);
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
