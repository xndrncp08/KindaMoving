import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { conditionsNear } from '@/lib/server/conditions';
/**
 * Route suitability from current conditions within 40 m of the path. Recomputed on
 * every request from live reports, so a new report or vote is reflected immediately.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Route not found.');
    const { db } = await context(request);
    const { data: area, error } = await db.rpc('route_condition_points', {
      p_route: id.data,
    });
    check(error);
    const a = (
      area as { lat: number; lon: number; radius_m: number }[] | null
    )?.[0];
    if (!a)
      return NextResponse.json({ status: 'no_geometry', assessments: [] });
    const near = await conditionsNear(
      db,
      a.lat,
      a.lon,
      Math.min(a.radius_m, 20000),
    );
    const ids = near.flatMap((x) => x.report_ids);
    const { data: onRoute, error: e2 } = ids.length
      ? await db.rpc('route_corridor_ids', { p_route: id.data, p_ids: ids })
      : { data: [], error: null };
    check(e2);
    const set = new Set((onRoute ?? []) as string[]);
    const assessments = near.filter((x) =>
      x.report_ids.some((r) => set.has(r)),
    );
    const current = assessments.filter(
      (x) => x.status === 'likely' || x.status === 'possible',
    );
    const worst = current.some((x) => x.status === 'likely' && x.severity >= 2)
      ? 'caution'
      : current.length
        ? 'check'
        : 'no_current_reports';
    return NextResponse.json(
      {
        status: worst,
        assessments,
        checked_at: new Date().toISOString(),
        note: 'No current reports does not mean the route is clear.',
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
