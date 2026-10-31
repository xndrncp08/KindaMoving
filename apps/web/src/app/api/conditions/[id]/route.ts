import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
/** Delete one of the caller's own reports (RLS restricts deletion to the reporter). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ApiError(404, 'Report not found.');
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('condition_reports')
      .delete()
      .eq('id', id.data)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    check(error);
    if (!data) throw new ApiError(404, 'Report not found.');
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
