import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/env';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const db = await supabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(safeNext(url.searchParams.get('next')), url.origin),
      );
  }
  return NextResponse.redirect(new URL('/login?error=callback', url.origin));
}
