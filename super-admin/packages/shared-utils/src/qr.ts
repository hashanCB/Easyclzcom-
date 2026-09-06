import { base64UrlToBytes, bytesToBase64Url, utf8ToBytes } from './base64.js';

export interface QrTokenPayload {
  studentId: string;
  cardVersion: number;
  expUnix: number;
}

export interface SignQrTokenInput extends QrTokenPayload {
  key: CryptoKey;
}

export interface VerifyQrTokenOptions {
  now?: number;
  ignoreExpiry?: boolean;
}

export interface VerifyResult {
  ok: boolean;
  payload?: QrTokenPayload;
  reason?: 'malformed' | 'bad_signature' | 'expired';
}

const VERSION = '1';

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error('SubtleCrypto not available. On React Native install react-native-quick-crypto polyfill.');
  }
  return c.subtle;
}

export function generateHmacSecretBytes(byteLength: number = 32): Uint8Array {
  if (byteLength < 16 || byteLength > 64) {
    throw new Error('generateHmacSecretBytes: byteLength must be 16..64');
  }
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c) throw new Error('Web Crypto not available');
  const buf = new Uint8Array(byteLength);
  c.getRandomValues(buf);
  return buf;
}

export async function importHmacKey(rawBytes: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey(
    'raw',
    rawBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function buildSigningInput(payload: QrTokenPayload): string {
  return `${VERSION}.${payload.studentId}.${payload.cardVersion}.${payload.expUnix}`;
}

export async function signQrToken(input: SignQrTokenInput): Promise<string> {
  const subtle = getSubtle();
  if (!Number.isInteger(input.cardVersion) || input.cardVersion < 0) {
    throw new Error('signQrToken: cardVersion must be a non-negative integer');
  }
  if (!Number.isInteger(input.expUnix) || input.expUnix < 0) {
    throw new Error('signQrToken: expUnix must be a non-negative integer');
  }
  if (input.studentId.includes('.')) {
    throw new Error('signQrToken: studentId must not contain "."');
  }
  const data = buildSigningInput(input);
  const sig = await subtle.sign('HMAC', input.key, utf8ToBytes(data) as unknown as BufferSource);
  const sigB64 = bytesToBase64Url(new Uint8Array(sig));
  return `${data}.${sigB64}`;
}

export async function verifyQrToken(
  token: string,
  key: CryptoKey,
  opts: VerifyQrTokenOptions = {}
): Promise<VerifyResult> {
  const subtle = getSubtle();
  const parts = token.split('.');
  if (parts.length !== 5) return { ok: false, reason: 'malformed' };
  const [v, studentId, cardVersionStr, expUnixStr, sigB64] = parts as [string, string, string, string, string];
  if (v !== VERSION) return { ok: false, reason: 'malformed' };
  const cardVersion = Number(cardVersionStr);
  const expUnix = Number(expUnixStr);
  if (!Number.isInteger(cardVersion) || !Number.isInteger(expUnix)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!studentId) return { ok: false, reason: 'malformed' };

  const data = buildSigningInput({ studentId, cardVersion, expUnix });
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlToBytes(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const valid = await subtle.verify(
    'HMAC',
    key,
    sigBytes as unknown as BufferSource,
    utf8ToBytes(data) as unknown as BufferSource
  );
  if (!valid) return { ok: false, reason: 'bad_signature' };

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (!opts.ignoreExpiry && expUnix < now) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, payload: { studentId, cardVersion, expUnix } };
}
