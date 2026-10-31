import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
/** Short-lived signed URL for the annotated video (owner only, via storage RLS). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Analysis not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('form_analyses')
      .select('annotated_path')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!data?.annotated_path)
      throw new ApiError(404, 'No annotated video (expired or not produced).');
    const signed = await db.storage
      .from('form-results')
      .createSignedUrl(data.annotated_path, 600);
    if (signed.error) throw new ApiError(404, 'Video unavailable.');
    return NextResponse.json(
      { url: signed.data.signedUrl },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
/** Delete an analysis and its stored video immediately. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Analysis not found.');
    const { db, user } = await context(request);
    const { data } = await db
      .from('form_analyses')
      .select('annotated_path,video_path')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) throw new ApiError(404, 'Analysis not found.');
    if (data.annotated_path)
      await db.storage.from('form-results').remove([data.annotated_path]);
    if (data.video_path)
      await db.storage.from('form-videos').remove([data.video_path]);
    const { error } = await db
      .from('form_analyses')
      .delete()
      .eq('id', id.data)
      .eq('user_id', user.id);
    check(error);
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
