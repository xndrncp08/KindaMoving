import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { configured, credentials } from './lib/env';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!configured()) return response;
  const { url, key } = credentials();
  const db = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });
  await db.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: [
    '/app/:path*',
    '/onboarding',
    '/api/:path*',
    '/auth/:path*',
    '/login',
  ],
};
