import 'server-only';
import { PermanentError, TransientError } from './errors';
/** Calls the Python analytics service with the shared service token. */
export async function analytics<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const base = process.env.ANALYTICS_URL;
  const token = process.env.ANALYTICS_SERVICE_TOKEN;
  if (!base || !token)
    throw new TransientError(
      'Analytics service is not configured.',
      'analytics_unconfigured',
      3600,
    );
  let response: Response;
  try {
    response = await fetch(base.replace(/\/$/, '') + path, {
      ...init,
      redirect: 'error',
      headers: { ...init.headers, Authorization: 'Bearer ' + token },
      signal: init.signal
        ? AbortSignal.any([
            init.signal,
            AbortSignal.timeout(init.timeoutMs ?? 60000),
          ])
        : AbortSignal.timeout(init.timeoutMs ?? 60000),
      cache: 'no-store',
    });
  } catch {
    throw new TransientError(
      'Analytics service unreachable.',
      'analytics_down',
    );
  }
  let body: Record<string, unknown> = {};
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Expected an object');
    body = value as Record<string, unknown>;
  } catch {
    // A proxy's HTTP 200 HTML (or interrupted JSON body) is not compute success.
    if (response.ok)
      throw new TransientError(
        'Analytics response was invalid.',
        'analytics_invalid_response',
      );
  }
  if (response.ok) return body as T;
  if (response.status === 422)
    throw new PermanentError(
      typeof body.error === 'string'
        ? body.error
        : 'File could not be processed.',
      typeof body.code === 'string' ? body.code : 'invalid_input',
    );
  if (response.status === 429 || response.status >= 500)
    throw new TransientError(
      'Analytics service busy.',
      'analytics_' + response.status,
    );
  throw new PermanentError(
    'Analytics request rejected.',
    'analytics_' + response.status,
  );
}
/** Route-handler helper: analytics failures become user-facing API errors. */
export async function analyticsApi<T>(
  path: string,
  body: unknown,
  timeoutMs = 30000,
): Promise<T> {
  const { ApiError } = await import('../api');
  try {
    return await analytics<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs,
    });
  } catch (e) {
    if (e instanceof TransientError)
      throw new ApiError(503, 'Route service is temporarily unavailable.');
    if (e instanceof PermanentError) throw new ApiError(422, e.message);
    throw e;
  }
}
