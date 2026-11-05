// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { corosSync } from '@/lib/jobs/coros-sync';
import { execute, type Job } from '@/lib/jobs/runner';
import { TransientError } from '@/lib/server/errors';

const { callTool, analytics } = vi.hoisted(() => ({
  callTool: vi.fn(),
  analytics: vi.fn(),
}));
vi.mock('@/lib/coros/session', () => ({
  corosClient: async () => ({ callTool }),
}));
vi.mock('@/lib/server/analytics', () => ({ analytics }));
vi.mock('@/lib/jobs/activity-import', () => ({ attachWeather: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ admin: vi.fn() }));

const job: Job = {
  id: 'job',
  user_id: 'user',
  account_id: 'account',
  kind: 'coros_sync',
  payload: {},
  attempts: 1,
  max_attempts: 5,
  progress: {},
};
const record = { id: 'record', label_id: '123', sport_type: 100 };
type Request = {
  table: string;
  method: string;
  body: Record<string, unknown>;
  url: URL;
};

/** Real PostgREST request construction, synthetic responses; no provider/account access. */
function fixture(
  reject: (r: Request) => boolean | Response = () => false,
  used = 0,
) {
  const requests: Request[] = [];
  const account = {
    id: 'account',
    user_id: 'user',
    status: 'connected',
    capabilities: ['querySportRecords', 'queryActivityFitFileDownloadUrls'],
    sync_cursor: '2026-11-04',
    fit_quota: { window_start: '2026-11-04T00:00:00Z', used },
  };
  const db = createClient('https://synthetic.invalid', 'synthetic-key', {
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const r = {
          table: url.pathname.split('/').at(-1)!,
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : {},
          url,
        };
        requests.push(r);
        const failure = reject(r);
        if (failure)
          return failure instanceof Response
            ? failure
            : Response.json(
                { code: 'XX000', message: 'private database detail' },
                { status: 503 },
              );
        let data: unknown = null;
        if (r.method === 'GET')
          data = r.table === 'connected_provider_accounts' ? account : [record];
        if (r.table === 'import_activity')
          data = { activity_id: 'activity', outcome: 'created' };
        if (r.table === 'heartbeat_job') data = false;
        if (r.table === 'finish_job')
          data = r.body.p_retry_after_s ? 'retry_wait' : r.body.p_status;
        if (r.table === 'connected_provider_accounts' && r.body.fit_quota) {
          // A competing reservation returns no row, like UPDATE ... WHERE quota = old_quota.
          const expected = r.url.searchParams.get('fit_quota');
          if (
            expected &&
            expected !== 'eq.' + JSON.stringify(account.fit_quota)
          )
            data = [];
          else {
            account.fit_quota = r.body.fit_quota as typeof account.fit_quota;
            data = [{ fit_quota: account.fit_quota }];
          }
        }
        return Response.json(data);
      },
    },
  });
  return { db, requests, account };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  vi.clearAllMocks();
  callTool.mockReset();
  callTool.mockImplementation(async (name) =>
    name === 'querySportRecords'
      ? { structuredContent: { records: [{ labelId: '123', sportType: 100 }] } }
      : {
          structuredContent: {
            files: [
              { labelId: '123', url: 'https://oss.coros.com/synthetic.fit' },
            ],
          },
        },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('synthetic-fit')),
  );
  analytics.mockResolvedValue({ start_time: '2026-11-04T10:00:00Z' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  [
    'listing',
    (r: Request) => r.table === 'provider_records' && r.method === 'POST',
    0,
  ],
  ['quota reservation', (r: Request) => !!r.body.fit_quota, 0],
  ['import status', (r: Request) => r.body.status === 'imported', 0],
  ['failed status', (r: Request) => r.body.status === 'failed', 0],
  ['quota deferral', (r: Request) => r.body.status === 'deferred_quota', 48],
  ['continuation', (r: Request) => r.table === 'sync_jobs', 48],
  ['cursor', (r: Request) => !!r.body.sync_cursor, 0],
] as const)(
  'retries after a failed %s write instead of succeeding',
  async (name, reject, used) => {
    if (name === 'failed status')
      callTool
        .mockResolvedValueOnce({ structuredContent: { records: [] } })
        .mockResolvedValueOnce({
          isError: true,
          content: [{ type: 'text', text: 'unavailable activity' }],
        });
    const { db, requests } = fixture(reject, used);
    expect(await execute(db, 'worker', job)).toBe('retry_wait');
    const finish = requests.find((r) => r.table === 'finish_job')!;
    expect(finish.body).toMatchObject({ p_code: 'db' });
    expect(finish.body.p_message).not.toContain('private database detail');
    if (name !== 'cursor')
      expect(requests.some((r) => r.body.sync_cursor)).toBe(false);
  },
);

it('reserves quota before a link call whose outcome can be lost', async () => {
  const { db, account, requests } = fixture();
  callTool.mockImplementation(async (name) => {
    if (name === 'querySportRecords')
      return { structuredContent: { records: [] } };
    expect(account.fit_quota.used).toBe(1);
    throw new TransientError('Connection interrupted.', 'coros_unreachable');
  });
  expect(await execute(db, 'worker', job)).toBe('retry_wait');
  expect(account.fit_quota.used).toBe(1);
  const reservation = requests.find((r) => r.body.fit_quota)!;
  expect(reservation.url.searchParams.get('status')).toBe('eq.connected');
  expect(reservation.url.searchParams.get('fit_quota')).toContain('"used":0');
});

it('stops a stale worker before it spends the same remaining quota', async () => {
  const f = fixture();
  callTool.mockImplementation(async (name) => {
    if (name === 'querySportRecords') {
      f.account.fit_quota = { ...f.account.fit_quota, used: 48 };
      return { structuredContent: { records: [] } };
    }
    throw new Error('A stale worker must not request a link');
  });
  expect(await execute(f.db, 'worker', job)).toBe('retry_wait');
  expect(
    callTool.mock.calls.every(([name]) => name === 'querySportRecords'),
  ).toBe(true);
  expect(f.account.fit_quota.used).toBe(48);
});

it('completes a persisted import and advances the cursor last', async () => {
  const { db, requests } = fixture();
  const result = await corosSync({ db, job, heartbeat: vi.fn() });
  expect(result).toMatchObject({ imported: 1, failed: 0, continues: false });
  expect(requests.at(-1)?.body).toMatchObject({ sync_cursor: '2026-11-04' });
  expect(vi.mocked(fetch).mock.calls[0][1]?.redirect).toBe('error');
});

it('cancels an oversized chunked FIT response before consuming the rest', async () => {
  const cancel = vi.fn();
  let reads = 0;
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      new ReadableStream(
        {
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(13 * 1024 * 1024));
            if (reads === 3) controller.close();
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
    ),
  );
  const { db, requests } = fixture();
  const result = await corosSync({ db, job, heartbeat: vi.fn() });
  expect(result).toMatchObject({ imported: 0, failed: 1 });
  expect(reads).toBe(2);
  expect(cancel).toHaveBeenCalledOnce();
  expect(analytics).not.toHaveBeenCalled();
  expect(requests.find((r) => r.body.status === 'failed')?.body.detail).toBe(
    'FIT file too large.',
  );
});

it('retries an interrupted FIT body without storing its raw error', async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('private signed FIT URL'));
        },
      }),
    ),
  );
  const { db, requests } = fixture();
  expect(await execute(db, 'worker', job)).toBe('retry_wait');
  expect(requests.find((r) => r.table === 'finish_job')?.body).toMatchObject({
    p_code: 'coros_download',
    p_message: 'FIT download failed.',
  });
});

it('reuses a persisted continuation after retrying a later failed write', async () => {
  const { db } = fixture(
    (r) =>
      r.table === 'sync_jobs' && r.method === 'POST'
        ? Response.json({ code: '23505' }, { status: 409 })
        : false,
    48,
  );
  expect(await execute(db, 'worker', job)).toBe('succeeded');
});

it('does not ignore an unrelated uniqueness error when no continuation exists', async () => {
  const { db } = fixture(
    (r) =>
      r.table !== 'sync_jobs'
        ? false
        : r.method === 'POST'
          ? Response.json({ code: '23505' }, { status: 409 })
          : Response.json(null),
    48,
  );
  expect(await execute(db, 'worker', job)).toBe('retry_wait');
});

it('does not advance the cursor when even a single day fills the listing limit', async () => {
  callTool.mockResolvedValue({
    structuredContent: {
      records: Array.from({ length: 50 }, (_, i) => ({
        labelId: String(i),
        sportType: 100,
      })),
    },
  });
  const { db, requests } = fixture();
  expect(await execute(db, 'worker', job)).toBe('failed');
  expect(requests.find((r) => r.table === 'finish_job')?.body).toMatchObject({
    p_code: 'coros_truncated',
  });
  expect(requests.some((r) => r.body.sync_cursor)).toBe(false);
});
