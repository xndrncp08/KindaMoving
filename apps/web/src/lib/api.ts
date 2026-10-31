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
const activityBase =
  'id,user_id,title,started_at,distance_m,elapsed_s,shoe_id,created_at,updated_at,start_time,utc_offset_s,moving_s,elevation_gain_m,avg_hr,sport,source';
/**
 * Explicit columns per resource. PostgREST would serialize PostGIS columns as
 * hex EWKB; casting to json yields GeoJSON. Lists omit heavy columns.
 */
export const columns: Record<string, { list: string; detail: string }> = {
  activities: {
    list: activityBase,
    detail:
      activityBase +
      ',elevation_loss_m,max_hr,avg_cadence,source_ref,device,metrics,weather,analytics_version,track:track::json',
  },
  routes: {
    list: 'id,user_id,title,description,distance_m,created_at,updated_at',
    detail:
      'id,user_id,title,description,distance_m,created_at,updated_at,path:path::json',
  },
  shoes: { list: '*', detail: '*' },
  workouts: { list: '*', detail: '*' },
};
