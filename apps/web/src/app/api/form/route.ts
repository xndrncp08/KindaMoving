import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure, check } from '@/lib/api';
import { kickJobs } from '@/lib/jobs/kick';
export async function GET(request: Request) {
  try {
    const { db, user } = await context(request);
    const { data, error } = await db
      .from('form_analyses')
      .select(
        'id,label,status,result,error,annotated_path,expires_at,created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    check(error);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
/** Register a video the browser uploaded to form-videos/<uid>/… and queue analysis. */
export async function POST(request: Request) {
  try {
    const { db, user } = await context(request);
    const body = z
      .object({
        path: z
          .string()
          .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|mov|m4v)$/i),
        label: z.string().trim().max(120).default(''),
      })
      .safeParse(await request.json());
    if (!body.success || !body.data.path.startsWith(user.id + '/'))
      throw new ApiError(400, 'Invalid upload.');
    const { data, error } = await db.rpc('request_form_analysis', {
      p_path: body.data.path,
      p_label: body.data.label,
    });
    if (error?.message.includes('limit'))
      throw new ApiError(429, 'Daily form analysis limit reached.');
    check(error);
    after(() => kickJobs(['form_analysis']));
    return NextResponse.json({ id: data }, { status: 202 });
  } catch (e) {
    return failure(e);
  }
}
