import 'server-only';
import { timingSafeEqual } from 'node:crypto';
/** Constant-time check of `Authorization: Bearer $CRON_SECRET` (secret must be ≥ 32 chars). */
export function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from('Bearer ' + secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
