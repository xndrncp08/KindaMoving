export function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function credentials() {
  if (!configured())
    throw new Error('Supabase is not configured. Follow docs/LOCAL_SETUP.md.');
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}
/** Same-origin path only. Parsing (not prefix checks) catches `/\t/evil.com`, which URL parsing turns into `//evil.com`. */
export function safeNext(value: string | null) {
  if (!value?.startsWith('/')) return '/app';
  const base = 'https://km.invalid';
  const url = new URL(value, base);
  return url.origin === base ? url.pathname + url.search + url.hash : '/app';
}
