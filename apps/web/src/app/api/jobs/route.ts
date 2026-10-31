import { NextResponse } from 'next/server';
import { context, failure, check } from '@/lib/api';
/** The caller's 50 most recent jobs; RLS limits rows to the caller. */
export async function GET(request: Request) {
  try {
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('sync_jobs')
      .select(
        'id,kind,status,attempts,max_attempts,error_code,error_message,progress,result,payload,run_after,created_at,updated_at,finished_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    check(error);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
