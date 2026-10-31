import { NextResponse } from 'next/server';
import { context, failure, check } from '@/lib/api';
import { admin } from '@/lib/supabase/admin';
import { discover, revoke } from '@/lib/coros/oauth';
import { open } from '@/lib/server/crypto';
import { quotaState } from '@/lib/coros/parse';
/** Connection status, capability list, quota and record counts. Never returns tokens. */
export async function GET(request: Request) {
  try {
    const { db, user } = await context(request);
    const { data: account, error } = await db
      .from('connected_provider_accounts')
      .select(
        'id,status,issuer,capabilities,connected_at,last_sync_at,sync_cursor,fit_quota,last_error',
      )
      .eq('user_id', user.id)
      .eq('provider', 'coros')
      .maybeSingle();
    check(error);
    if (!account)
      return NextResponse.json(
        { status: 'disconnected' },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    const { data: records } = await db
      .from('provider_records')
      .select('status')
      .eq('account_id', account.id);
    const counts: Record<string, number> = {};
    for (const r of records ?? [])
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    return NextResponse.json(
      {
        ...account,
        fit_quota: quotaState(account.fit_quota ?? {}),
        records: counts,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
/** Disconnect: revoke at COROS (best effort), destroy stored tokens, keep imported activities. */
export async function DELETE(request: Request) {
  try {
    const { user } = await context(request);
    const db = admin();
    const { data: account } = await db
      .from('connected_provider_accounts')
      .select('id,issuer')
      .eq('user_id', user.id)
      .eq('provider', 'coros')
      .maybeSingle();
    let revoked = false;
    if (account) {
      const { data: stored } = await db.rpc('vault_get', {
        p_account: account.id,
        p_user: user.id,
      });
      const t = (
        stored as
          | {
              client_id: string;
              refresh_token: string | null;
              access_token: string;
            }[]
          | null
      )?.[0];
      if (t && account.issuer) {
        try {
          const meta = await discover(account.issuer);
          const token = t.refresh_token
            ? open(t.refresh_token, `coros:${account.id}:refresh`)
            : open(t.access_token, `coros:${account.id}:access`);
          revoked = await revoke(meta, t.client_id, token);
        } catch {
          revoked = false;
        }
      }
      await db.rpc('vault_delete', { p_account: account.id, p_user: user.id });
      await db
        .from('sync_jobs')
        .update({ status: 'cancelled' })
        .eq('account_id', account.id)
        .in('status', ['queued', 'retry_wait']);
      await db
        .from('connected_provider_accounts')
        .update({ status: 'disconnected', capabilities: [], last_error: null })
        .eq('id', account.id);
    }
    return NextResponse.json({ disconnected: true, revoked_at_coros: revoked });
  } catch (e) {
    return failure(e);
  }
}
