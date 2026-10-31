import { ZodError } from 'zod';
import { NextResponse } from 'next/server';
import { supabase } from './supabase/server';
import { configured } from './env';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Each endpoint checks identity independently; layouts are not authorization boundaries. */
export async function context(request: Request) {
  if (!configured())
    throw new ApiError(503, 'Database connection is not configured.');
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    throw new ApiError(403, 'Invalid request origin.');
  const db = await supabase();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ApiError(401, 'Sign in to continue.');
  return { db, user: data.user };
}
export function failure(error: unknown) {
  if (error instanceof SyntaxError || error instanceof ZodError)
    error = new ApiError(400, 'Invalid request body.');
  return NextResponse.json(
    {
      error:
        error instanceof ApiError
          ? error.message
          : 'Unable to complete this request.',
    },
    { status: error instanceof ApiError ? error.status : 500 },
  );
}
export function check(error: unknown) {
  if (error)
    throw new ApiError(
      400,
      'Database rejected this change. Check linked records and try again.',
    );
}
