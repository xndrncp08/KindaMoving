import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
/** Bulk shoe (re)assignment; `shoe_id: null` unassigns. Ownership enforced by RLS and composite FKs. */
export async function POST(request: Request) {
  try {
    const { db } = await context(request);
    const body = z
      .object({
        activity_ids: z.array(z.uuid()).min(1).max(500),
        shoe_id: z.uuid().nullable(),
      })
      .safeParse(await request.json());
    if (!body.success) throw new ApiError(400, 'Invalid assignment.');
    const { data, error } = await db.rpc('assign_shoe', {
      p_activity_ids: body.data.activity_ids,
      p_shoe: body.data.shoe_id,
    });
    check(error);
    return NextResponse.json({ updated: data });
  } catch (e) {
    return failure(e);
  }
}
