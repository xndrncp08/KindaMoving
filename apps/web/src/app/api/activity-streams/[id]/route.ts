import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, failure, check, ApiError } from '@/lib/api';
/** Processed sample streams of one owned activity (columnar arrays). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Streams not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('activity_streams')
      .select('point_count,data')
      .eq('activity_id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!data) throw new ApiError(404, 'Streams not found.');
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
