import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from './lib/security';
import { configured, credentials, safeNext } from './lib/env';
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === 'development',
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();
  response.headers.set('Content-Security-Policy', csp);
  if (
    !configured() ||
    [
      '/api/healthz',
      '/api/readyz',
      '/api/jobs/run',
      '/api/conditions/official',
      '/api/form/cleanup',
    ].includes(request.nextUrl.pathname) ||
    !/^\/(app|onboarding|api|auth|login)(?:\/|$)/.test(request.nextUrl.pathname)
  )
    return response;
  const { url, key } = credentials();
  const db = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set('cookie', request.cookies.toString());
        response = next();
        response.headers.set('Content-Security-Policy', csp);
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });
  const { data, error } = await db.auth.getClaims();
  const path = request.nextUrl.pathname;
  const go = (to: URL) => {
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  };
  // Only a clean "no session" redirects here; refresh/network failures fall through to requireUser.
  if (!data && !error && /^\/(app|onboarding)(?:\/|$)/.test(path)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path + request.nextUrl.search);
    return go(login);
  }
  // `?error` means a server check rejected this session; showing the form avoids a redirect loop.
  if (data && path === '/login' && !request.nextUrl.searchParams.has('error'))
    return go(
      new URL(safeNext(request.nextUrl.searchParams.get('next')), request.url),
    );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|mjs|js|webmanifest)$).*)',
  ],
};
