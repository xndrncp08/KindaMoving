/** CSP origins are explicit; analytics stays server-to-server and needs no browser grant. */
export function contentSecurityPolicy(
  nonce: string,
  development = false,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
) {
  const connections = ["'self'", 'https://tiles.openfreemap.org'];
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    connections.push(url.origin, url.origin.replace(/^http/, 'ws'));
  }
  if (development) connections.push('ws://127.0.0.1:*', 'ws://localhost:*');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // MapLibre, Recharts, Radix and React position UI using inline styles.
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    `connect-src ${connections.join(' ')}`,
    "img-src 'self' data: blob: https://tiles.openfreemap.org" +
      (supabaseUrl ? ' ' + new URL(supabaseUrl).origin : ''),
    "media-src 'self' blob:" +
      (supabaseUrl ? ' ' + new URL(supabaseUrl).origin : ''),
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
