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
export function safeNext(value: string | null) {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
    ? value
    : '/app';
}
