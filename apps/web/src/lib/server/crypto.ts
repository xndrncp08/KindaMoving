import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
/**
 * AES-256-GCM sealing for provider tokens and OAuth state cookies.
 * Format: `v1.<iv>.<ciphertext||tag>` (base64url). The 32-byte key comes from
 * TOKEN_ENCRYPTION_KEY (base64). `aad` binds a ciphertext to its context (e.g.
 * the owning account) so a sealed value cannot be replayed under another owner.
 */
function key() {
  const raw = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? '', 'base64');
  if (raw.length !== 32)
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  return raw;
}
export const cryptoConfigured = () => {
  try {
    key();
    return true;
  } catch {
    return false;
  }
};
export function seal(plain: string, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `v1.${iv.toString('base64url')}.${body.toString('base64url')}`;
}
export function open(sealed: string, aad: string) {
  const [version, iv, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !body)
    throw new Error('Unsupported sealed value.');
  const data = Buffer.from(body, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([
    decipher.update(data.subarray(0, data.length - 16)),
    decipher.final(),
  ]).toString('utf8');
}
