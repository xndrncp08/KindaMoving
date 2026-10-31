import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, failure, check, ApiError } from '@/lib/api';
/** Km splits and device laps of one owned activity. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Splits not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('activity_splits')
      .select(
        'kind,split_index,distance_m,elapsed_s,moving_s,avg_hr,elevation_gain_m,start_offset_s',
      )
      .eq('activity_id', id.data)
      .eq('user_id', user.id)
      .order('kind')
      .order('split_index');
    check(error);
    // Keep the client's Split shape: `index` rather than the column name.
    const rows = (data ?? []).map(({ split_index, ...r }) => ({
      index: split_index,
      ...r,
    }));
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
