import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
/** Confirm, clear or flag someone else's report (one vote per person; changeable). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Report not found.');
    const { db } = await context(request);
    const body = z
      .object({ vote: z.enum(['confirm', 'clear', 'flag']) })
      .safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Invalid vote.');
    const { error } = await db.rpc('vote_condition', {
      p_report: id.data,
      p_vote: body.data.vote,
    });
    if (error?.message.includes('own report'))
      throw new ApiError(400, 'You cannot vote on your own report.');
    if (error?.message.includes('limit'))
      throw new ApiError(429, 'Vote limit reached; try again later.');
    check(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
