// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authorizeUrl,
  corosUrl,
  discover,
  register,
  tokenRequest,
  type Metadata,
} from '@/lib/coros/oauth';
import { McpClient, parseRpcBody, rpc, Unauthorized } from '@/lib/coros/mcp';
import {
  parseFitUrls,
  parseSportRecords,
  quotaAvailable,
  quotaState,
} from '@/lib/coros/parse';
import { open, seal } from '@/lib/server/crypto';
import { PermanentError, TransientError } from '@/lib/server/errors';

// Captured verbatim (fields used) from https://mcp.coros.com on 2026-10-31.
const PROTECTED = {
  resource: 'https://mcpus.coros.com/mcp',
  authorization_servers: ['https://mcpus.coros.com'],
  scopes_supported: ['openid', 'mcp.tools', 'offline_access'],
};
const AS = {
  issuer: 'https://mcpus.coros.com',
  authorization_endpoint: 'https://mcpus.coros.com/oauth2/authorize',
  token_endpoint: 'https://mcpus.coros.com/oauth2/token',
  revocation_endpoint: 'https://mcpus.coros.com/oauth2/revoke',
  registration_endpoint: 'https://mcpus.coros.com/connect/register',
  code_challenge_methods_supported: ['S256'],
};
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});
afterEach(() => vi.unstubAllGlobals());

describe('COROS OAuth', () => {
  it('discovers endpoints through RFC 9728 then RFC 8414', async () => {
    fetchMock
      .mockResolvedValueOnce(json(PROTECTED))
      .mockResolvedValueOnce(json(AS));
    const meta = await discover('https://mcp.coros.com');
    expect(meta).toMatchObject({
      issuer: 'https://mcpus.coros.com',
      token_endpoint: AS.token_endpoint,
      mcp_url: 'https://mcpus.coros.com/mcp',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://mcp.coros.com/.well-known/oauth-protected-resource/mcp',
    );
  });
  it('refuses metadata pointing credentials outside coros.com', async () => {
    fetchMock
      .mockResolvedValueOnce(json(PROTECTED))
      .mockResolvedValueOnce(
        json({ ...AS, token_endpoint: 'https://evil.example/token' }),
      );
    await expect(discover('https://mcpeu.coros.com')).rejects.toBeInstanceOf(
      PermanentError,
    );
    expect(corosUrl('http://mcp.coros.com')).toBeNull();
    expect(corosUrl('https://coros.com.evil.example')).toBeNull();
    expect(corosUrl('https://mcpus.coros.com/x')).toBe(
      'https://mcpus.coros.com/x',
    );
  });
  it('registers a public PKCE client and builds an S256 authorization URL', async () => {
    fetchMock.mockResolvedValueOnce(json({ client_id: 'abc' }, 201));
    const meta = { ...AS, mcp_url: 'https://mcpus.coros.com/mcp' } as Metadata;
    expect(await register(meta, 'https://km.test/api/coros/callback')).toBe(
      'abc',
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      token_endpoint_auth_method: 'none',
      redirect_uris: ['https://km.test/api/coros/callback'],
      scope: 'openid offline_access mcp.tools',
    });
    const url = new URL(
      authorizeUrl(meta, 'abc', 'https://km.test/cb', 'challenge', 'st'),
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      code_challenge_method: 'S256',
      resource: 'https://mcpus.coros.com/mcp',
      state: 'st',
      client_id: 'abc',
    });
  });
  it('classifies token endpoint failures', async () => {
    const meta = { ...AS, mcp_url: '' } as Metadata;
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    await expect(tokenRequest(meta, {})).rejects.toMatchObject({
      code: 'reauth_required',
    });
    fetchMock.mockResolvedValueOnce(json({}, 503));
    await expect(tokenRequest(meta, {})).rejects.toBeInstanceOf(TransientError);
    fetchMock.mockResolvedValueOnce(
      json({ access_token: 'a', refresh_token: 'r', expires_in: 2592000 }),
    );
    expect(await tokenRequest(meta, {})).toMatchObject({
      access_token: 'a',
      expires_in: 2592000,
    });
  });
});

describe('MCP transport', () => {
  it('parses JSON and SSE bodies', () => {
    expect(
      parseRpcBody(
        '{"jsonrpc":"2.0","id":1,"result":{"ok":1}}',
        'application/json',
      ).result,
    ).toEqual({ ok: 1 });
    const sse =
      'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n';
    expect(parseRpcBody(sse, 'text/event-stream')?.result).toEqual({
      tools: [],
    });
  });
  it('maps HTTP status to retry semantics', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(
      rpc('https://mcpus.coros.com/mcp', 't', 'tools/list', {}),
    ).rejects.toBeInstanceOf(Unauthorized);
    fetchMock.mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'retry-after': '120' } }),
    );
    await expect(
      rpc('https://mcpus.coros.com/mcp', 't', 'tools/list', {}),
    ).rejects.toMatchObject({ retryAfterS: 120 });
    fetchMock.mockResolvedValueOnce(
      json({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'Invalid params' },
      }),
    );
    await expect(
      rpc('https://mcpus.coros.com/mcp', 't', 'tools/call', {}),
    ).rejects.toBeInstanceOf(PermanentError);
  });
  it('refreshes once on 401 and paginates tools', async () => {
    const refresh = vi.fn(async () => 'fresh');
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(json({ jsonrpc: '2.0', id: 1, result: {} }))
      .mockResolvedValueOnce(
        json({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'querySportRecords' }], nextCursor: 'p2' },
        }),
      )
      .mockResolvedValueOnce(
        json({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'uploadRouteFile' }] },
        }),
      );
    const client = new McpClient(
      'https://mcpus.coros.com/mcp',
      async () => 'stale',
      refresh,
    );
    expect((await client.listTools()).map((t) => t.name)).toEqual([
      'querySportRecords',
      'uploadRouteFile',
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      'Bearer fresh',
    );
  });
});

describe('tool result parsing', () => {
  it('reads structured records and never guesses identifiers', () => {
    const structured = {
      structuredContent: {
        records: [
          {
            labelId: '476123',
            sportType: 100,
            date: '20261003',
            distanceKm: 12.03,
          },
          { labelId: 'x', sportType: 100 },
        ],
      },
    };
    expect(parseSportRecords(structured).records).toEqual([
      {
        labelId: '476123',
        sportType: 100,
        date: '2026-10-03',
        distanceM: 12030,
      },
    ]);
    // The guide's example text has no labelId: it must be counted as unparsed, not imported.
    const docExample = {
      content: [
        {
          type: 'text',
          text: 'Sport Records — 2026-09-19 to 2026-10-18 (1 records)\n\n1. Sport(9807) — 2026-10-03\n   Duration: 2:12:38 | Distance: 12.03 km\n   Average Pace: 11:01 /km',
        },
      ],
    };
    expect(parseSportRecords(docExample)).toEqual({ records: [], unparsed: 1 });
    const withIds = {
      content: [
        {
          type: 'text',
          text: '1. Sport(100) — 2026-10-03\n   labelId: 476999 | sportType: 100\n   Distance: 10.00 km',
        },
      ],
    };
    expect(parseSportRecords(withIds).records[0]).toMatchObject({
      labelId: '476999',
      sportType: 100,
      distanceM: 10000,
    });
  });
  it('extracts HTTPS FIT links only', () => {
    expect(
      parseFitUrls({
        structuredContent: {
          files: [
            { labelId: 1, url: 'https://oss.coros.com/a.fit' },
            { url: 'http://x/b.fit' },
          ],
        },
      }),
    ).toEqual([{ labelId: '1', url: 'https://oss.coros.com/a.fit' }]);
    expect(
      parseFitUrls({
        content: [
          { type: 'text', text: 'Download: https://cdn.example.com/f.fit.' },
        ],
      }),
    ).toEqual([{ labelId: null, url: 'https://cdn.example.com/f.fit' }]);
  });
  it('tracks the fixed 24 h FIT quota window', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const q = quotaState(
      { window_start: '2026-10-31T00:00:00Z', used: 48 },
      now,
    );
    expect(quotaAvailable(q)).toBe(false);
    expect(
      quotaState({ window_start: '2026-10-30T11:00:00Z', used: 50 }, now),
    ).toMatchObject({ used: 0 });
  });
});

describe('token sealing', () => {
  it('round-trips and binds ciphertext to its context', () => {
    const s = seal('secret-token', 'coros:a:access');
    expect(s).not.toContain('secret-token');
    expect(open(s, 'coros:a:access')).toBe('secret-token');
    expect(() => open(s, 'coros:b:access')).toThrow();
    const [v, iv, body] = s.split('.');
    const tampered = Buffer.from(body, 'base64url');
    tampered[0] ^= 1;
    expect(() =>
      open([v, iv, tampered.toString('base64url')].join('.'), 'coros:a:access'),
    ).toThrow();
  });
});

describe('token refresh races', () => {
  const account = {
    id: 'acc',
    user_id: 'u',
    status: 'connected',
    issuer: 'https://mcpus.coros.com',
    mcp_url: 'https://mcpus.coros.com/mcp',
    capabilities: [],
    sync_cursor: null,
    fit_quota: {},
  };
  const row = (
    access: string,
    refresh: string,
    updated: string,
    expires = '2000-01-01T00:00:00Z',
  ) => ({
    client_id: 'c',
    access_token: seal(access, 'coros:acc:access'),
    refresh_token: seal(refresh, 'coros:acc:refresh'),
    access_expires_at: expires,
    updated_at: updated,
  });
  it('uses a token refreshed concurrently by another worker instead of disconnecting', async () => {
    const { corosClient } = await import('@/lib/coros/session');
    const rpcCalls: string[] = [];
    let reads = 0;
    const db = {
      rpc: vi.fn(async (name: string) => {
        rpcCalls.push(name);
        if (name === 'vault_get')
          return {
            data: [
              reads++ === 0
                ? row('old', 'r1', 't1')
                : row('theirs', 'r2', 't2', '2099-01-01T00:00:00Z'),
            ],
            error: null,
          };
        return { data: null, error: null };
      }),
      from: vi.fn(() => ({
        update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
      })),
    };
    // discovery (cached per base) then our refresh is rejected because the other worker rotated r1.
    fetchMock
      .mockResolvedValueOnce(json(PROTECTED))
      .mockResolvedValueOnce(json(AS))
      .mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400))
      .mockResolvedValueOnce(json({ jsonrpc: '2.0', id: 1, result: {} }))
      .mockResolvedValueOnce(
        json({ jsonrpc: '2.0', id: 1, result: { tools: [] } }),
      );
    const client = await corosClient(db as never, account);
    await client.listTools();
    expect(rpcCalls).not.toContain('vault_delete');
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(
      'Bearer theirs',
    );
  });
  it('marks reauth when the refresh token is genuinely rejected', async () => {
    const { corosClient } = await import('@/lib/coros/session');
    const rpcCalls: string[] = [];
    const db = {
      rpc: vi.fn(async (name: string) => {
        rpcCalls.push(name);
        return name === 'vault_get'
          ? { data: [row('old', 'r1', 't1')], error: null }
          : { data: null, error: null };
      }),
      from: vi.fn(() => ({
        update: () => ({ eq: () => ({ eq: async () => ({}) }) }),
      })),
    };
    fetchMock.mockResolvedValue(json({ error: 'invalid_grant' }, 400));
    const client = await corosClient(db as never, {
      ...account,
      issuer: 'https://mcpeu.coros.com',
    });
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        json({
          ...PROTECTED,
          authorization_servers: ['https://mcpeu.coros.com'],
          resource: 'https://mcpeu.coros.com/mcp',
        }),
      )
      .mockResolvedValueOnce(json({ ...AS, issuer: 'https://mcpeu.coros.com' }))
      .mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    await expect(client.listTools()).rejects.toMatchObject({
      code: 'reauth_required',
    });
    expect(rpcCalls).toContain('vault_delete');
  });
});
