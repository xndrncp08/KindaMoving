import { NextResponse } from 'next/server';
import { profileSchema } from '@km/types';
import { context, failure, check, ApiError } from '@/lib/api';
export async function GET(request: Request) {
  try {
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('profiles')
      .select('*,user_preferences(*)')
      .eq('id', user.id)
      .maybeSingle();
    check(error);
    if (!data) return NextResponse.json(null);
    const { user_preferences, ...profile } = data;
    return NextResponse.json(
      { ...profile, ...user_preferences },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    const { db } = await context(request);
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, 'Invalid profile fields.');
    const { error } = await db.rpc('save_profile', { input: parsed.data });
    check(error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
