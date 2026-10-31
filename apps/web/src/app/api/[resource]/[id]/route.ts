import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resourceSchemas } from '@km/types';
import { context, failure, check, ApiError } from '@/lib/api';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
) {
  try {
    const { resource, id } = await params;
    if (
      !Object.hasOwn(resourceSchemas, resource) ||
      !z.uuid().safeParse(id).success
    )
      throw new ApiError(404, 'Record not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from(resource)
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!data) throw new ApiError(404, 'Record not found.');
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
