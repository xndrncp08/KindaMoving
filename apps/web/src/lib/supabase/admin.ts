import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../api';
import { credentials } from '../env';
/**
 * Service-role client for trusted background work only (job runner, OAuth token
 * storage, account deletion). Bypasses RLS: every query must scope by an owner
 * ID that was verified upstream. Never import from client components.
 */
export function admin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new ApiError(503, 'Background processing is not configured.');
  return createClient(credentials().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const backgroundConfigured = () =>
  Boolean(process.env.SUPABASE_SECRET_KEY && process.env.ANALYTICS_URL);
