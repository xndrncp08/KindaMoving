import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/supabase/admin', () => ({
  admin: vi.fn(),
  backgroundConfigured: () => true,
}));
import { backoff, PermanentError, TransientError } from '@/lib/server/errors';
import { diffJobs, type Seen } from '@/lib/sync';
import { execute, type Job } from '@/lib/jobs/runner';
import type { Job as ClientJob } from '@km/types';

describe('backoff', () => {
  it('grows exponentially with equal jitter and a cap', () => {
    expect(backoff(1, 30, 3600, () => 0)).toBe(15);
    expect(backoff(1, 30, 3600, () => 1)).toBe(30);
    expect(backoff(4, 30, 3600, () => 0.5)).toBe(180);
    expect(backoff(20, 30, 3600, () => 1)).toBe(3600);
    for (let a = 1; a < 10; a++) expect(backoff(a)).toBeGreaterThan(0);
  });
});

const snap = (
  id: string,
  status: ClientJob['status'],
  updated_at: string,
  kind = 'activity_import',
) => ({ id, status, updated_at, kind }) as ClientJob;
describe('client job transitions', () => {
  it('reports each transition once', () => {
    const seen: Seen = new Map();
    expect(
      diffJobs(seen, [snap('a', 'queued', '2026-10-31T10:00:00Z')]),
    ).toHaveLength(1);
    expect(
      diffJobs(seen, [snap('a', 'queued', '2026-10-31T10:00:00Z')]),
    ).toHaveLength(0);
    const t = diffJobs(seen, [snap('a', 'succeeded', '2026-10-31T10:00:05Z')]);
    expect(t).toEqual([
      expect.objectContaining({ from: 'queued', to: 'succeeded' }),
    ]);
  });
  it('ignores stale out-of-order responses', () => {
    const seen: Seen = new Map();
    diffJobs(seen, [snap('a', 'succeeded', '2026-10-31T10:00:05Z')]);
    expect(
      diffJobs(seen, [snap('a', 'running', '2026-10-31T10:00:01Z')]),
    ).toHaveLength(0);
    expect(seen.get('a')?.status).toBe('succeeded');
  });
});

describe('job execution', () => {
  const rpc = vi.fn();
  const db = { rpc } as never;
  const job = (kind: string, attempts = 1): Job => ({
    id: 'j1',
    user_id: 'u1',
    account_id: null,
    kind,
    payload: {},
    attempts,
    max_attempts: 5,
    progress: {},
  });
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation(
      async (name: string, args: Record<string, unknown>) =>
        name === 'finish_job'
          ? {
              data: args.p_retry_after_s != null ? 'retry_wait' : args.p_status,
              error: null,
            }
          : { data: false, error: null },
    );
  });
  it('fails unknown kinds permanently without retry', async () => {
    expect(await execute(db, 'w', job('nope'))).toBe('failed');
    expect(rpc).toHaveBeenCalledWith(
      'finish_job',
      expect.objectContaining({ p_code: 'unsupported', p_retry_after_s: null }),
    );
  });
  it('fails invalid payloads permanently', async () => {
    expect(await execute(db, 'w', job('activity_import'))).toBe('failed');
    expect(rpc).toHaveBeenCalledWith(
      'finish_job',
      expect.objectContaining({ p_code: 'bad_payload', p_retry_after_s: null }),
    );
  });
  it('classifies errors', () => {
    expect(new TransientError('x', 'rate', 90).retryAfterS).toBe(90);
    expect(new PermanentError('x').code).toBe('permanent');
  });
  it('does not overwrite a job whose lease was lost', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'finish_job'
        ? { data: null, error: { message: 'Lease lost' } }
        : { data: false, error: null },
    );
    expect(await execute(db, 'w', job('nope'))).toBe('lease_lost');
  });
});
