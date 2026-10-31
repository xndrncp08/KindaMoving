import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, failure, check, ApiError } from '@/lib/api';
export async function GET(request: Request) {
  try {
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('saved_routes')
      .select('route_id')
      .eq('user_id', user.id);
    check(error);
    return NextResponse.json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await context(request);
    const { route_id } = z
      .object({ route_id: z.uuid() })
      .parse(await request.json());
    const { error } = await db
      .from('saved_routes')
      .upsert(
        { user_id: user.id, route_id },
        { onConflict: 'user_id,route_id' },
      );
    check(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    const { db, user } = await context(request);
    const id = z.uuid().safeParse(new URL(request.url).searchParams.get('id'));
    if (!id.success) throw new ApiError(400, 'Invalid ID.');
    const { error } = await db
      .from('saved_routes')
      .delete()
      .eq('user_id', user.id)
      .eq('route_id', id.data);
    check(error);
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
