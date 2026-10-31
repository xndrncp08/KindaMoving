import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { open, seal } from '../server/crypto';
import { McpClient } from './mcp';
import {
  authorizeUrl,
  discover,
  pkce,
  register,
  REGIONS,
  tokenRequest,
  type Region,
} from './oauth';
import { storeTokens } from './session';

export const COOKIE = 'km_coros_oauth';
const AAD = 'coros-oauth-state';
const flow = z.object({
  state: z.string(),
  verifier: z.string(),
  client: z.string(),
  base: z.string(),
  redirect: z.string(),
  user: z.uuid(),
  exp: z.number(),
});
export type Flow = z.infer<typeof flow>;

export async function begin(
  db: SupabaseClient,
  userId: string,
  region: Region,
  origin: string,
) {
  const base = REGIONS[region];
  const meta = await discover(base);
  const redirect = origin + '/api/coros/callback';
  // One registration per issuer + redirect URI, shared by all users of this deployment.
  let client = (
    await db.rpc('vault_client', {
      p_issuer: meta.issuer,
      p_redirect: redirect,
      p_client: null,
    })
  ).data as string | null;
  if (!client) {
    const registered = await register(meta, redirect);
    client = (
      await db.rpc('vault_client', {
        p_issuer: meta.issuer,
        p_redirect: redirect,
        p_client: registered,
      })
    ).data as string;
  }
  const { verifier, challenge } = pkce();
  const state = crypto.randomUUID();
  const cookie = seal(
    JSON.stringify({
      state,
      verifier,
      client,
      base,
      redirect,
      user: userId,
      exp: Date.now() + 600000,
    } satisfies Flow),
    AAD,
  );
  return {
    url: authorizeUrl(meta, client, redirect, challenge, state),
    cookie,
  };
}

export function readFlow(cookie: string | undefined): Flow | null {
  if (!cookie) return null;
  try {
    const parsed = flow.safeParse(JSON.parse(open(cookie, AAD)));
    return parsed.success && parsed.data.exp > Date.now() ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Exchange the code, store sealed tokens, then verify the connection by listing
 * tools. The account is marked `connected` only after that verification succeeds.
 */
export async function complete(db: SupabaseClient, f: Flow, code: string) {
  const meta = await discover(f.base);
  const tokens = await tokenRequest(meta, {
    grant_type: 'authorization_code',
    client_id: f.client,
    code,
    code_verifier: f.verifier,
    redirect_uri: f.redirect,
    resource: meta.mcp_url,
  });
  const { data: account, error } = await db
    .from('connected_provider_accounts')
    .upsert(
      {
        user_id: f.user,
        provider: 'coros',
        status: 'error',
        issuer: meta.issuer,
        mcp_url: meta.mcp_url,
        scopes: tokens.scope ?? null,
        last_error: 'Verifying connection…',
      },
      { onConflict: 'user_id,provider' },
    )
    .select('id')
    .single();
  if (error || !account) throw new Error('Could not save the COROS account.');
  await storeTokens(db, account.id, f.user, f.client, tokens);
  const client = new McpClient(
    meta.mcp_url,
    async () => tokens.access_token,
    async () => tokens.access_token,
  );
  const tools = await client.listTools();
  await db
    .from('connected_provider_accounts')
    .update({
      status: 'connected',
      capabilities: tools.map((t) => t.name).sort(),
      connected_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', account.id);
  await db.from('sync_jobs').insert({
    user_id: f.user,
    account_id: account.id,
    kind: 'coros_sync',
    payload: { backfill_days: 30 },
    idempotency_key:
      'initial-' + account.id + '-' + new Date().toISOString().slice(0, 10),
  });
  return { accountId: account.id, tools: tools.length };
}
