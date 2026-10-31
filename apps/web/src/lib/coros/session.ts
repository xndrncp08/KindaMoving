import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { open, seal } from '../server/crypto';
import { PermanentError } from '../server/errors';
import { McpClient } from './mcp';
import { discover, tokenRequest, type Tokens } from './oauth';

export interface CorosAccount {
  id: string;
  user_id: string;
  status: string;
  issuer: string | null;
  mcp_url: string | null;
  capabilities: string[];
  sync_cursor: string | null;
  fit_quota: { window_start?: string; used?: number };
}
interface Stored {
  client_id: string;
  access_token: string;
  refresh_token: string | null;
  access_expires_at: string | null;
  updated_at: string;
}
const REFRESH_SKEW_MS = 5 * 60 * 1000;
/** Ciphertexts are bound to their account so a row copied to another account cannot decrypt. */
const aad = (account: string, kind: string) => `coros:${account}:${kind}`;

export async function storeTokens(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  clientId: string,
  t: Tokens,
  previousRefresh?: string | null,
) {
  const refresh = t.refresh_token ?? previousRefresh ?? null;
  const { error } = await db.rpc('vault_put', {
    p_account: accountId,
    p_user: userId,
    p_client: clientId,
    p_access: seal(t.access_token, aad(accountId, 'access')),
    p_refresh: refresh ? seal(refresh, aad(accountId, 'refresh')) : null,
    p_expires: t.expires_in
      ? new Date(Date.now() + t.expires_in * 1000).toISOString()
      : null,
  });
  if (error) throw new Error('Token storage failed.');
}

async function load(
  db: SupabaseClient,
  account: CorosAccount,
): Promise<Stored | null> {
  const { data, error } = await db.rpc('vault_get', {
    p_account: account.id,
    p_user: account.user_id,
  });
  if (error) throw new Error('Token vault unavailable.');
  return (data as Stored[] | null)?.[0] ?? null;
}

export async function markReauth(
  db: SupabaseClient,
  account: CorosAccount,
  message: string,
) {
  await db.rpc('vault_delete', {
    p_account: account.id,
    p_user: account.user_id,
  });
  await db
    .from('connected_provider_accounts')
    .update({ status: 'reauth_required', last_error: message })
    .eq('id', account.id)
    .eq('user_id', account.user_id);
}

/**
 * MCP client bound to one account, with proactive refresh (5 min before expiry)
 * and reactive refresh on 401. COROS rotates refresh tokens, so two workers that
 * refresh concurrently would invalidate one another: after a failed refresh the
 * vault is re-read, and a newer token written by the other worker is used
 * instead of declaring the account disconnected.
 */
export async function corosClient(db: SupabaseClient, account: CorosAccount) {
  if (account.status !== 'connected' || !account.issuer || !account.mcp_url)
    throw new PermanentError('COROS is not connected.', 'not_connected');
  let stored = await load(db, account);
  if (!stored) {
    await markReauth(db, account, 'Stored authorization is missing.');
    throw new PermanentError(
      'COROS authorization is missing; reconnect.',
      'reauth_required',
    );
  }
  let access = open(stored.access_token, aad(account.id, 'access'));

  const refresh = async () => {
    const used = stored!;
    if (!used.refresh_token) {
      await markReauth(db, account, 'No refresh token was issued.');
      throw new PermanentError(
        'COROS authorization expired; reconnect.',
        'reauth_required',
      );
    }
    const refreshToken = open(used.refresh_token, aad(account.id, 'refresh'));
    try {
      const meta = await discover(account.issuer!);
      const t = await tokenRequest(meta, {
        grant_type: 'refresh_token',
        client_id: used.client_id,
        refresh_token: refreshToken,
      });
      await storeTokens(
        db,
        account.id,
        account.user_id,
        used.client_id,
        t,
        refreshToken,
      );
      stored = await load(db, account);
      access = t.access_token;
      return access;
    } catch (e) {
      const latest = await load(db, account);
      if (latest && latest.updated_at !== used.updated_at) {
        stored = latest; // another worker refreshed first
        access = open(latest.access_token, aad(account.id, 'access'));
        return access;
      }
      if (e instanceof PermanentError && e.code === 'reauth_required')
        await markReauth(db, account, e.message);
      throw e;
    }
  };

  const token = async () => {
    const expires = stored?.access_expires_at
      ? Date.parse(stored.access_expires_at)
      : Infinity;
    if (expires - Date.now() < REFRESH_SKEW_MS) return refresh();
    return access;
  };
  return new McpClient(account.mcp_url, token, refresh);
}
