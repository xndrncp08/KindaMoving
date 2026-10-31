import { ApiError, context, failure, check } from '@/lib/api';
export const maxDuration = 60;
// Every table holding the caller's data, read with the caller's own RLS-scoped client.
const TABLES: [string, string][] = [
  ['profiles', '*'],
  ['user_preferences', '*'],
  ['activities', '*,track:track::json'],
  ['activity_splits', '*'],
  ['activity_streams', '*'],
  ['activity_uploads', '*'],
  ['routes', '*,path:path::json'],
  ['saved_routes', '*'],
  ['route_condition_reports', '*'],
  ['shoes', '*'],
  ['shoe_wear_observations', '*'],
  ['workouts', '*'],
  ['training_plans', '*'],
  [
    'condition_reports',
    'id,kind,severity,observed_at,description,status,created_at',
  ],
  ['condition_votes', '*'],
  [
    'connected_provider_accounts',
    'id,provider,status,issuer,capabilities,connected_at,last_sync_at,sync_cursor',
  ],
  ['provider_records', '*'],
  [
    'sync_jobs',
    'id,kind,status,attempts,error_code,error_message,result,created_at,finished_at',
  ],
  ['form_analyses', 'id,label,status,result,created_at,expires_at'],
];
/** Machine-readable export of everything stored for the caller (JSON download). Tokens are never included. */
export async function GET(request: Request) {
  try {
    const { db, user } = await context(request);
    const { data: allowed } = await db.rpc('hit_rate_limit', {
      p_action: 'account_export',
      p_limit: 5,
      p_window_s: 86400,
    });
    if (allowed === false)
      throw new ApiError(429, 'Exports are limited to 5 per day.');
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
    };
    for (const [table, cols] of TABLES) {
      const rows: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from(table)
          .select(cols)
          .range(from, from + 999);
        check(error);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      out[table] = rows;
    }
    return new Response(JSON.stringify(out), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kindamoving-export-${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
