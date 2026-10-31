import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
const id = z.uuid();
/** Optional wear observations (rating 1-5 and a note) for one owned shoe. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const shoe = id.safeParse((await params).id);
    if (!shoe.success) throw new ApiError(404, 'Shoe not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('shoe_wear_observations')
      .select('id,observed_on,rating,note')
      .eq('user_id', user.id)
      .eq('shoe_id', shoe.data)
      .order('observed_on', { ascending: false })
      .limit(100);
    check(error);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const shoe = id.safeParse((await params).id);
    if (!shoe.success) throw new ApiError(404, 'Shoe not found.');
    const { db, user } = await context(request);
    const body = z
      .object({
        observed_on: z.iso.date(),
        rating: z.number().int().min(1).max(5).nullable(),
        note: z.string().trim().max(500),
      })
      .safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Invalid observation.');
    const { error } = await db
      .from('shoe_wear_observations')
      .insert({ ...body.data, shoe_id: shoe.data, user_id: user.id });
    check(error);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
