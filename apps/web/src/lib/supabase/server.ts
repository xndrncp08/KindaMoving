import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { credentials } from '../env';
export async function supabase() {
  const jar = await cookies();
  const { url, key } = credentials();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          /* Server Components rely on proxy for refreshed cookies. */
        }
      },
    },
  });
}
