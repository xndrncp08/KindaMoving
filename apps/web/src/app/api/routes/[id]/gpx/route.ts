import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { gpxFilename, toGpx } from '@/lib/gpx';
/** GPX 1.1 download of an owned mapped route. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Route not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('routes')
      .select('title,description,path:path::json')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    const path = data?.path as { coordinates?: number[][] } | null;
    if (!data || !path?.coordinates)
      throw new ApiError(404, 'This route has no mapped geometry to export.');
    return new Response(toGpx(data.title, path.coordinates, data.description), {
      headers: {
        'Content-Type': 'application/gpx+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${gpxFilename(data.title)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
