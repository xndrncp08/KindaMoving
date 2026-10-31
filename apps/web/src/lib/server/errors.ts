/** Retryable failure (network, 5xx, rate limit). ``retryAfterS`` overrides computed backoff. */
export class TransientError extends Error {
  constructor(
    message: string,
    public code = 'transient',
    public retryAfterS?: number,
  ) {
    super(message);
  }
}
/** Non-retryable failure; the message is shown to the user. */
export class PermanentError extends Error {
  constructor(
    message: string,
    public code = 'permanent',
  ) {
    super(message);
  }
}
export class CancelledError extends Error {}
/**
 * Exponential backoff with "equal jitter": half the delay is fixed, half random,
 * so retries from many jobs spread out without ever retrying immediately.
 */
export function backoff(
  attempt: number,
  baseS = 30,
  capS = 3600,
  random = Math.random,
) {
  const ceiling = Math.min(capS, baseS * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
