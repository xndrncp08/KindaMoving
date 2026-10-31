import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { importOfficial } from '@/lib/server/official';
import { cronAuthorized } from '@/lib/server/cron';
export const maxDuration = 60;
/** Scheduled import of official Calgary closures/incidents (Authorization: Bearer CRON_SECRET). */
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  return NextResponse.json(await importOfficial(admin()));
}
