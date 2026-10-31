import 'server-only';
import { PermanentError, TransientError } from '../server/errors';

/**
 * Minimal MCP client for the stateless COROS endpoint (streamable HTTP,
 * protocol 2025-06-18). Each call is a JSON-RPC POST; responses may be plain
 * JSON or a single-message SSE stream. No session header is required.
 */
export const PROTOCOL = '2025-06-18';
export class Unauthorized extends Error {}

export interface ToolResult {
  content?: {
    type: string;
    text?: string;
    resource?: unknown;
    [k: string]: unknown;
  }[];
  structuredContent?: unknown;
  isError?: boolean;
}
export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Extract the JSON-RPC response from a JSON or text/event-stream body. */
export function parseRpcBody(text: string, contentType: string | null) {
  if (contentType?.includes('text/event-stream')) {
    let last: unknown = null;
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const msg = JSON.parse(data);
        if (msg && ('result' in msg || 'error' in msg)) last = msg;
      } catch {
        /* keep-alive or partial frame */
      }
    }
    return last as {
      result?: unknown;
      error?: { code: number; message: string };
    } | null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function rpc(
  url: string,
  token: string,
  method: string,
  params: Record<string, unknown>,
  id = 1,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });
  } catch {
    throw new TransientError('COROS is unreachable.', 'coros_unreachable');
  }
  if (response.status === 401)
    throw new Unauthorized('COROS rejected the access token.');
  if (response.status === 429) {
    const retry = Number(response.headers.get('retry-after'));
    throw new TransientError(
      'COROS rate limit reached.',
      'coros_rate_limited',
      Number.isFinite(retry) && retry > 0 ? retry : 300,
    );
  }
  if (response.status >= 500)
    throw new TransientError(
      'COROS is temporarily unavailable.',
      'coros_' + response.status,
    );
  const body = parseRpcBody(
    await response.text(),
    response.headers.get('content-type'),
  );
  if (!response.ok || !body)
    throw new PermanentError(
      'Unexpected COROS response.',
      'coros_' + response.status,
    );
  if (body.error)
    throw new PermanentError(
      'COROS rejected the request: ' + String(body.error.message).slice(0, 200),
      'coros_rpc',
    );
  return body.result as Record<string, unknown>;
}

export class McpClient {
  private initialized = false;
  constructor(
    private url: string,
    private token: () => Promise<string>,
    private refresh: () => Promise<string>,
  ) {}
  /** One automatic retry after a 401 with a refreshed token. */
  private async call(method: string, params: Record<string, unknown>) {
    try {
      return await rpc(this.url, await this.token(), method, params);
    } catch (e) {
      if (!(e instanceof Unauthorized)) throw e;
      return rpc(this.url, await this.refresh(), method, params);
    }
  }
  private async init() {
    if (this.initialized) return;
    await this.call('initialize', {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: 'KindaMoving', version: '2.0.0' },
    });
    this.initialized = true;
  }
  async listTools(): Promise<ToolInfo[]> {
    await this.init();
    const tools: ToolInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await this.call('tools/list', cursor ? { cursor } : {});
      tools.push(...((result.tools as ToolInfo[]) ?? []));
      cursor =
        typeof result.nextCursor === 'string' && result.nextCursor
          ? result.nextCursor
          : undefined;
      if (!cursor) break;
    }
    return tools;
  }
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    await this.init();
    return (await this.call('tools/call', {
      name,
      arguments: args,
    })) as ToolResult;
  }
}
