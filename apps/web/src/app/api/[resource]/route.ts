import { NextResponse } from 'next/server';
import { resourceSchemas, type Resource } from '@km/types';
import { ApiError, context, failure, check } from '@/lib/api';
import { z } from 'zod';
function resource(value: string): Resource {
  if (!Object.hasOwn(resourceSchemas, value))
    throw new ApiError(404, 'Unknown resource.');
  return value as Resource;
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const name = resource((await params).resource);
    const { db, user } = await context(request);
    // shortcut: lists stop at 500; add cursor pagination before high-volume ingestion.
    const { data, error } = await db
      .from(name)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);
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
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const name = resource((await params).resource);
    const { db, user } = await context(request);
    const parsed = resourceSchemas[name].safeParse(await request.json());
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid fields. Check dates, distances and required values.',
      );
    const { data, error } = await db
      .from(name)
      .insert({ ...parsed.data, user_id: user.id })
      .select()
      .single();
    check(error);
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const name = resource((await params).resource);
    const { db, user } = await context(request);
    const body = await request.json();
    const id = z.uuid().safeParse(body.id);
    const parsed = resourceSchemas[name].safeParse(body);
    if (!id.success || !parsed.success)
      throw new ApiError(400, 'Invalid record.');
    const { data, error } = await db
      .from(name)
      .update(parsed.data)
      .eq('id', id.data)
      .eq('user_id', user.id)
      .select()
      .maybeSingle();
    check(error);
    if (!data) throw new ApiError(404, 'Record not found.');
    return NextResponse.json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const name = resource((await params).resource);
    const { db, user } = await context(request);
    const id = z.uuid().safeParse(new URL(request.url).searchParams.get('id'));
    if (!id.success) throw new ApiError(400, 'Invalid ID.');
    const { data, error } = await db
      .from(name)
      .delete()
      .eq('id', id.data)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    check(error);
    if (!data) throw new ApiError(404, 'Record not found.');
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
