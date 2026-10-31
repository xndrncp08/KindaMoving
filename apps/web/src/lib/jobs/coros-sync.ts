import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { analytics } from '../server/analytics';
import { PermanentError, TransientError } from '../server/errors';
import { corosClient, type CorosAccount } from '../coros/session';
import type { McpClient, ToolResult } from '../coros/mcp';
import {
  parseFitUrls,
  parseSportRecords,
  quotaAvailable,
  quotaState,
  RUNNING_SPORTS,
} from '../coros/parse';
import { attachWeather } from './activity-import';
import type { JobContext } from './runner';

const payload = z.object({
  backfill_days: z.number().int().min(1).max(365).optional(),
  continue: z.boolean().optional(),
});
const LIST_LIMIT = 50;
const MAX_FIT_BYTES = 25 * 1024 * 1024;
const BUDGET_MS = 40000;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const text = (r: ToolResult) =>
  (r.content ?? [])
    .map((c) => c.text ?? '')
    .join(' ')
    .slice(0, 200);

export async function loadAccount(
  db: SupabaseClient,
  userId: string,
): Promise<CorosAccount> {
  const { data, error } = await db
    .from('connected_provider_accounts')
    .select(
      'id,user_id,status,issuer,mcp_url,capabilities,sync_cursor,fit_quota',
    )
    .eq('user_id', userId)
    .eq('provider', 'coros')
    .maybeSingle();
  if (error) throw new TransientError('Database unavailable.', 'db');
  if (!data)
    throw new PermanentError('COROS is not connected.', 'not_connected');
  return data as CorosAccount;
}

export function requireTool(account: CorosAccount, tool: string) {
  if (!account.capabilities.includes(tool))
    throw new PermanentError(
      `Your COROS connection does not offer ${tool}. Reconnect to refresh capabilities.`,
      'capability_missing',
    );
}

/** List activity records for [start, end], halving the window whenever a page may be truncated. */
async function listWindow(
  client: McpClient,
  start: Date,
  end: Date,
  out: Map<string, ReturnType<typeof parseSportRecords>['records'][number]>,
  stats: { unparsed: number },
) {
  const result = await client.callTool('querySportRecords', {
    startDate: ymd(start),
    endDate: ymd(end),
    limit: LIST_LIMIT,
  });
  if (result.isError)
    throw new PermanentError(
      'COROS could not list activities: ' + text(result),
      'coros_tool_error',
    );
  const { records, unparsed } = parseSportRecords(result);
  stats.unparsed += unparsed;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (records.length >= LIST_LIMIT && days >= 1) {
    const mid = new Date(start.getTime() + Math.floor(days / 2) * 86400000);
    await listWindow(client, start, mid, out, stats);
    await listWindow(
      client,
      new Date(mid.getTime() + 86400000),
      end,
      out,
      stats,
    );
    return;
  }
  for (const r of records) out.set(r.labelId, r);
}

async function download(url: string) {
  const u = new URL(url);
  // Links come from COROS's authenticated response; still refuse non-HTTPS or local targets.
  if (
    u.protocol !== 'https:' ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)
  )
    throw new PermanentError(
      'COROS returned an unusable download link.',
      'coros_link',
    );
  let response: Response;
  try {
    response = await fetch(u, {
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
      redirect: 'follow',
    });
  } catch {
    throw new TransientError('FIT download failed.', 'coros_download');
  }
  if (response.status >= 500 || response.status === 429)
    throw new TransientError('FIT download unavailable.', 'coros_download');
  if (!response.ok)
    throw new PermanentError(
      'FIT download link was rejected or expired.',
      'coros_link',
    );
  if (Number(response.headers.get('content-length') ?? 0) > MAX_FIT_BYTES)
    throw new PermanentError('FIT file too large.', 'too_large');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FIT_BYTES)
    throw new PermanentError('FIT file too large.', 'too_large');
  return bytes;
}

/**
 * coros_sync: list recent COROS activities, record each label once, then import
 * running activities through their original FIT files within the documented
 * 50-file/24 h quota. Work beyond the time budget or quota continues in a
 * follow-up job; nothing is fetched twice because provider_records and
 * activities(source, source_ref) are both unique.
 */
export async function corosSync({ db, job, heartbeat }: JobContext) {
  const p = payload.safeParse(job.payload ?? {});
  if (!p.success)
    throw new PermanentError('Invalid job payload.', 'bad_payload');
  const started = Date.now();
  const account = await loadAccount(db, job.user_id);
  requireTool(account, 'querySportRecords');
  requireTool(account, 'queryActivityFitFileDownloadUrls');
  const client = await corosClient(db, account);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const from = p.data.backfill_days
    ? new Date(today.getTime() - p.data.backfill_days * 86400000)
    : account.sync_cursor
      ? new Date(Date.parse(account.sync_cursor + 'T00:00:00Z') - 2 * 86400000) // late uploads from the watch
      : new Date(today.getTime() - 30 * 86400000);

  const listed = new Map<
    string,
    ReturnType<typeof parseSportRecords>['records'][number]
  >();
  const stats = { unparsed: 0 };
  if (!p.data.continue) {
    for (let s = from; s <= today; s = new Date(s.getTime() + 7 * 86400000)) {
      const e = new Date(Math.min(s.getTime() + 6 * 86400000, today.getTime()));
      await listWindow(client, s, e, listed, stats);
      await heartbeat({
        stage: 'listing',
        through: e.toISOString().slice(0, 10),
        found: listed.size,
      });
    }
    if (listed.size)
      await db.from('provider_records').upsert(
        [...listed.values()].map((r) => ({
          user_id: job.user_id,
          account_id: account.id,
          label_id: r.labelId,
          sport_type: r.sportType,
          distance_m: r.distanceM,
          start_time: r.date ? r.date + 'T00:00:00Z' : null,
          status: RUNNING_SPORTS.has(r.sportType) ? 'seen' : 'skipped',
          detail: RUNNING_SPORTS.has(r.sportType)
            ? null
            : `Sport code ${r.sportType} is not a run.`,
        })),
        { onConflict: 'account_id,label_id', ignoreDuplicates: true },
      );
  }

  const { data: pending, error } = await db
    .from('provider_records')
    .select('id,label_id,sport_type')
    .eq('account_id', account.id)
    .in('status', ['seen', 'deferred_quota'])
    .order('start_time', { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) throw new TransientError('Database unavailable.', 'db');
  const counts = { imported: 0, duplicate: 0, failed: 0, deferred: 0 };
  let quota = quotaState(account.fit_quota);
  let remaining = 0;
  for (const [i, rec] of (pending ?? []).entries()) {
    if (Date.now() - started > BUDGET_MS) {
      remaining = pending!.length - i;
      break;
    }
    quota = quotaState(quota);
    if (!quotaAvailable(quota)) {
      counts.deferred = pending!.length - i;
      await db
        .from('provider_records')
        .update({
          status: 'deferred_quota',
          detail: 'COROS daily FIT quota reached; resumes ' + quota.resets_at,
        })
        .eq('account_id', account.id)
        .in('status', ['seen']);
      break;
    }
    try {
      const links = await client.callTool('queryActivityFitFileDownloadUrls', {
        labelId: rec.label_id,
        sportType: rec.sport_type,
        limit: 1,
      });
      quota = { ...quota, used: quota.used + 1 };
      await db
        .from('connected_provider_accounts')
        .update({ fit_quota: quota })
        .eq('id', account.id);
      if (links.isError) {
        const msg = text(links);
        if (/quota|limit|exceed/i.test(msg)) {
          quota = { ...quota, used: 50 };
          await db
            .from('connected_provider_accounts')
            .update({ fit_quota: quota })
            .eq('id', account.id);
          counts.deferred++;
          continue;
        }
        throw new PermanentError('COROS: ' + msg, 'coros_tool_error');
      }
      const url = parseFitUrls(links).find(
        (l) => !l.labelId || l.labelId === rec.label_id,
      )?.url;
      if (!url)
        throw new PermanentError(
          'COROS returned no FIT link for this activity.',
          'coros_no_link',
        );
      const bytes = await download(url);
      const parsed = await analytics<Record<string, unknown>>(
        '/v1/activities/parse?format=fit',
        {
          method: 'POST',
          body: bytes,
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      );
      const saved = await db.rpc('import_activity', {
        p_user: job.user_id,
        p_source: 'coros',
        p_source_ref: rec.label_id,
        p_upload: null,
        p: parsed,
      });
      if (saved.error)
        throw new TransientError('Import could not be saved.', 'db');
      const outcome = saved.data as { activity_id: string; outcome: string };
      await attachWeather(db, job.user_id, outcome, parsed);
      await db
        .from('provider_records')
        .update({
          status: outcome.outcome === 'duplicate' ? 'duplicate' : 'imported',
          activity_id: outcome.activity_id,
          start_time: parsed.start_time as string,
          detail: null,
        })
        .eq('id', rec.id);
      counts[outcome.outcome === 'duplicate' ? 'duplicate' : 'imported']++;
    } catch (e) {
      // A transient failure stops this run (the job retries); a permanent one is isolated to its record.
      if (!(e instanceof PermanentError)) throw e;
      counts.failed++;
      await db
        .from('provider_records')
        .update({ status: 'failed', detail: e.message.slice(0, 300) })
        .eq('id', rec.id);
    }
    await heartbeat({ stage: 'importing', ...counts });
  }
  const followUp = remaining > 0 || counts.deferred > 0;
  if (followUp)
    await db.from('sync_jobs').insert({
      user_id: job.user_id,
      account_id: account.id,
      kind: 'coros_sync',
      payload: { continue: true },
      idempotency_key: 'continue-' + job.id,
      run_after:
        counts.deferred > 0 ? quota.resets_at : new Date().toISOString(),
    });
  await db
    .from('connected_provider_accounts')
    .update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      ...(p.data.continue
        ? {}
        : { sync_cursor: today.toISOString().slice(0, 10) }),
    })
    .eq('id', account.id);
  return {
    listed: listed.size,
    unparsed_records: stats.unparsed,
    ...counts,
    remaining,
    continues: followUp,
  };
}
