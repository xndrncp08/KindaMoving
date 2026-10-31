import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, context, failure } from '@/lib/api';
import { admin } from '@/lib/supabase/admin';
import { discover, revoke } from '@/lib/coros/oauth';
import { open } from '@/lib/server/crypto';
const BUCKETS = ['activity-files', 'form-videos', 'form-results'];
async function removeFolder(
  db: SupabaseClient,
  bucket: string,
  folder: string,
) {
  let removed = 0;
  for (;;) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(folder, { limit: 1000 });
    if (error) throw new Error(`Could not list ${bucket}.`);
    if (!data?.length) return removed;
    const { error: e2 } = await db.storage
      .from(bucket)
      .remove(data.map((o) => `${folder}/${o.name}`));
    if (e2) throw new Error(`Could not delete files in ${bucket}.`);
    removed += data.length;
  }
}
/**
 * Permanently delete the account. Order matters: stored files first (they are not
 * covered by database cascades), COROS access revoked, then the auth user, whose
 * deletion cascades every owned row. Requires typing DELETE.
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await context(request);
    if (
      !z
        .object({ confirm: z.literal('DELETE') })
        .safeParse(await request.json().catch(() => ({}))).success
    )
      throw new ApiError(400, 'Type DELETE to confirm.');
    const db = admin();
    const files: Record<string, number> = {};
    for (const bucket of BUCKETS)
      files[bucket] = await removeFolder(db, bucket, user.id);
    const { data: account } = await db
      .from('connected_provider_accounts')
      .select('id,issuer')
      .eq('user_id', user.id)
      .maybeSingle();
    let corosRevoked: boolean | null = null;
    if (account?.issuer) {
      const { data: t } = await db.rpc('vault_get', {
        p_account: account.id,
        p_user: user.id,
      });
      const row = (
        t as { client_id: string; refresh_token: string | null }[] | null
      )?.[0];
      if (row?.refresh_token) {
        try {
          corosRevoked = await revoke(
            await discover(account.issuer),
            row.client_id,
            open(row.refresh_token, `coros:${account.id}:refresh`),
          );
        } catch {
          corosRevoked = false;
        }
      }
    }
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error)
      throw new ApiError(
        500,
        'Account deletion failed; your files were removed but the account remains. Try again or contact support.',
      );
    const response = NextResponse.json({
      deleted: true,
      files,
      coros_revoked: corosRevoked,
    });
    for (const c of request.headers.get('cookie')?.split(';') ?? []) {
      const name = c.split('=')[0].trim();
      if (name.startsWith('sb-'))
        response.cookies.set(name, '', { maxAge: 0, path: '/' });
    }
    return response;
  } catch (e) {
    return failure(e);
  }
}
