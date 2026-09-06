import * as Crypto from 'expo-crypto';

/**
 * RFC-4122 v4 UUID. Required because the Supabase cloud schema uses
 * `uuid` primary keys — non-UUID strings are rejected with a 400 on push.
 * Uses native `crypto.randomUUID` when available; falls back to a v4 built
 * from `expo-crypto`'s secure random bytes (which works on both native and web).
 */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = Crypto.getRandomBytes(16);
  // Set version (4) and variant (10) bits per RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
