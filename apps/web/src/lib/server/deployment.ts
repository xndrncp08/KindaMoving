/** Validate deployment configuration without ever including values in errors. */
export function deploymentErrors(
  env: Record<string, string | undefined> = process.env,
) {
  const errors: string[] = [];
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'ANALYTICS_SERVICE_TOKEN',
    'CRON_SECRET',
    'TOKEN_ENCRYPTION_KEY',
  ])
    if (!env[key]) errors.push(key + ' is required');
  for (const key of ['ANALYTICS_SERVICE_TOKEN', 'CRON_SECRET'])
    if ((env[key]?.length ?? 0) < 32)
      errors.push(key + ' must have at least 32 characters');
  if (
    env.ANALYTICS_SERVICE_TOKEN &&
    env.ANALYTICS_SERVICE_TOKEN === env.CRON_SECRET
  )
    errors.push('Use distinct service and scheduler secrets');
  const key = env.TOKEN_ENCRYPTION_KEY ?? '';
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(key) ||
    Buffer.from(key, 'base64').length !== 32
  )
    errors.push('TOKEN_ENCRYPTION_KEY must encode 32 bytes');
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SITE_URL',
    'ANALYTICS_URL',
  ]) {
    try {
      const u = new URL(env[key] ?? '');
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== '/' ||
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1'
      )
        throw new Error();
    } catch {
      errors.push(key + ' must be a public HTTPS origin');
    }
  }
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_'))
    errors.push('Public Supabase key must not be a secret key');
  if (!['true', 'false', undefined].includes(env.WEATHER_DISABLED))
    errors.push('WEATHER_DISABLED must be true or false');
  if (env.WEATHER_DISABLED !== 'true' && !env.OPEN_METEO_API_KEY)
    errors.push(
      'Production weather needs OPEN_METEO_API_KEY or WEATHER_DISABLED=true',
    );
  return errors;
}
