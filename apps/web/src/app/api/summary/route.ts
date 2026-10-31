import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, failure, check, ApiError } from '@/lib/api';
export async function GET(request: Request) {
  try {
    const { db } = await context(request);
    const week = z.iso
      .date()
      .safeParse(new URL(request.url).searchParams.get('week'));
    if (!week.success) throw new ApiError(400, 'Invalid week.');
    const { data, error } = await db.rpc('running_summary', {
      week_start: week.data,
    });
    check(error);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return failure(e);
  }
}
