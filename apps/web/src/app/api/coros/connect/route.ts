import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, context, failure } from '@/lib/api';
import { admin } from '@/lib/supabase/admin';
import { cryptoConfigured } from '@/lib/server/crypto';
import { PermanentError, TransientError } from '@/lib/server/errors';
import { begin, COOKIE } from '@/lib/coros/connect';
/** Starts OAuth: returns the COROS authorization URL; PKCE/state live in a sealed httpOnly cookie. */
export async function POST(request: Request) {
  try {
    const { user } = await context(request);
    if (!cryptoConfigured())
      throw new ApiError(
        503,
        'COROS connection is not configured on this server.',
      );
    const { region } = z
      .object({ region: z.enum(['auto', 'us', 'eu', 'cn']).default('auto') })
      .parse(await request.json().catch(() => ({})));
    const origin = new URL(request.url).origin;
    try {
      const { url, cookie } = await begin(admin(), user.id, region, origin);
      const response = NextResponse.json({ url });
      response.cookies.set(COOKIE, cookie, {
        httpOnly: true,
        secure: origin.startsWith('https'),
        sameSite: 'lax',
        path: '/api/coros',
        maxAge: 600,
      });
      return response;
    } catch (e) {
      if (e instanceof TransientError)
        throw new ApiError(
          503,
          'COROS is unavailable right now. Try again shortly.',
        );
      if (e instanceof PermanentError) throw new ApiError(502, e.message);
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
