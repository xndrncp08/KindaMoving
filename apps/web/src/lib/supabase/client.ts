import { createBrowserClient } from '@supabase/ssr';
import { credentials } from '../env';
export function browserSupabase() {
  const { url, key } = credentials();
  return createBrowserClient(url, key);
}
