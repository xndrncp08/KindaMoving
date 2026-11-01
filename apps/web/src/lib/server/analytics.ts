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
      signal: AbortSignal.timeout(init.timeoutMs ?? 60000),
      cache: 'no-store',
    });
  } catch {
    throw new TransientError(
      'Analytics service unreachable.',
      'analytics_down',
    );
  }
  const body = await response.json().catch(() => ({}));
  if (response.ok) return body as T;
  if (response.status === 422)
    throw new PermanentError(
      body.error || 'File could not be processed.',
      body.code || 'invalid_input',
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
