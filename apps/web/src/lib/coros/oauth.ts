import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PermanentError, TransientError } from '../server/errors';

/**
 * OAuth for the official COROS MCP server (https://github.com/coroslab/COROS-MCP).
 * Verified against live discovery documents on 2026-10-31:
 *   /.well-known/oauth-protected-resource/mcp  (RFC 9728) -> authorization server
 *   /.well-known/oauth-authorization-server     (RFC 8414) -> endpoints, PKCE S256, DCR
 * KindaMoving is a public client: dynamic registration (RFC 7591) with
 * token_endpoint_auth_method "none" and PKCE, exactly like the official helper.
 */
export const REGIONS = {
  auto: 'https://mcp.coros.com',
  us: 'https://mcpus.coros.com',
  eu: 'https://mcpeu.coros.com',
  cn: 'https://mcpcn.coros.com',
} as const;
export type Region = keyof typeof REGIONS;
export const SCOPES = 'openid offline_access mcp.tools';

/** Only HTTPS endpoints on coros.com are ever contacted with credentials. */
export function corosUrl(value: unknown) {
  const url = z.url().safeParse(value);
  if (!url.success) return null;
  const u = new URL(url.data);
  return u.protocol === 'https:' &&
    (u.hostname === 'coros.com' || u.hostname.endsWith('.coros.com'))
    ? u.toString().replace(/\/$/, '')
    : null;
}

export interface Metadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string | null;
  mcp_url: string;
}

async function getJson(url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
  } catch {
    throw new TransientError('COROS is unreachable.', 'coros_unreachable');
  }
  if (response.status >= 500 || response.status === 429)
    throw new TransientError(
      'COROS is unavailable.',
      'coros_' + response.status,
    );
  if (!response.ok)
    throw new PermanentError('COROS discovery failed.', 'coros_discovery');
  return response.json();
}

const cache = new Map<string, { at: number; meta: Metadata }>();
export async function discover(base: string): Promise<Metadata> {
  const hit = cache.get(base);
  if (hit && Date.now() - hit.at < 3600000) return hit.meta;
  const resource = await getJson(
    base + '/.well-known/oauth-protected-resource/mcp',
  );
  const issuer = corosUrl(resource.authorization_servers?.[0]);
  const mcpUrl = corosUrl(resource.resource);
  if (!issuer || !mcpUrl)
    throw new PermanentError(
      'Unexpected COROS discovery document.',
      'coros_discovery',
    );
  const as = await getJson(issuer + '/.well-known/oauth-authorization-server');
  const meta = {
    issuer: corosUrl(as.issuer),
    authorization_endpoint: corosUrl(as.authorization_endpoint),
    token_endpoint: corosUrl(as.token_endpoint),
    registration_endpoint: corosUrl(as.registration_endpoint),
    revocation_endpoint: corosUrl(as.revocation_endpoint),
    mcp_url: mcpUrl,
  };
  if (
    meta.issuer !== issuer ||
    !meta.authorization_endpoint ||
    !meta.token_endpoint ||
    !meta.registration_endpoint ||
    !as.code_challenge_methods_supported?.includes('S256')
  )
    throw new PermanentError(
      'COROS authorization server metadata is incomplete.',
      'coros_discovery',
    );
  const result = meta as Metadata;
  cache.set(base, { at: Date.now(), meta: result });
  return result;
}

export async function register(meta: Metadata, redirectUri: string) {
  let response: Response;
  try {
    response = await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'KindaMoving',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: SCOPES,
        token_endpoint_auth_method: 'none',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new TransientError('COROS is unreachable.', 'coros_unreachable');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.client_id !== 'string')
    throw new PermanentError(
      'COROS rejected client registration for this site address.',
      'coros_registration',
    );
  return body.client_id as string;
}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function authorizeUrl(
  meta: Metadata,
  clientId: string,
  redirectUri: string,
  challenge: string,
  state: string,
) {
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: meta.mcp_url,
    state,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().positive().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});
export type Tokens = z.infer<typeof tokenSchema>;

/** Token endpoint call. `invalid_grant`/`invalid_client` are permanent; everything else retries. */
export async function tokenRequest(
  meta: Metadata,
  form: Record<string, string>,
): Promise<Tokens> {
  let response: Response;
  try {
    response = await fetch(meta.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new TransientError('COROS is unreachable.', 'coros_unreachable');
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok) {
    const parsed = tokenSchema.safeParse(body);
    if (parsed.success) return parsed.data;
    throw new PermanentError(
      'COROS returned an unexpected token response.',
      'coros_token',
    );
  }
  if (response.status >= 500 || response.status === 429)
    throw new TransientError(
      'COROS token service unavailable.',
      'coros_' + response.status,
    );
  throw new PermanentError(
    body.error === 'invalid_grant'
      ? 'COROS authorization expired or was revoked.'
      : 'COROS rejected the token request.',
    body.error === 'invalid_grant' ? 'reauth_required' : 'coros_token',
  );
}

export async function revoke(meta: Metadata, clientId: string, token: string) {
  if (!meta.revocation_endpoint) return false;
  try {
    const response = await fetch(meta.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, client_id: clientId }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
