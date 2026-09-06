import { describe, expect, it } from 'vitest';
import {
  generateHmacSecretBytes,
  importHmacKey,
  signQrToken,
  verifyQrToken,
} from '../qr.js';

async function freshKey() {
  const secret = generateHmacSecretBytes();
  return importHmacKey(secret);
}

describe('signQrToken / verifyQrToken', () => {
  const studentId = '00000000-0000-4000-8000-000000000001';
  const cardVersion = 1;
  const expUnix = Math.floor(Date.now() / 1000) + 60 * 60;

  it('verifies a freshly signed token', async () => {
    const key = await freshKey();
    const token = await signQrToken({ studentId, cardVersion, expUnix, key });
    const r = await verifyQrToken(token, key);
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({ studentId, cardVersion, expUnix });
  });

  it('contains no PII (only id, version, exp, sig)', async () => {
    const key = await freshKey();
    const token = await signQrToken({ studentId, cardVersion, expUnix, key });
    const parts = token.split('.');
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('1');
    expect(parts[1]).toBe(studentId);
  });

  it('rejects token signed with a different key', async () => {
    const k1 = await freshKey();
    const k2 = await freshKey();
    const token = await signQrToken({ studentId, cardVersion, expUnix, key: k1 });
    const r = await verifyQrToken(token, k2);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad_signature');
  });

  it('rejects expired token', async () => {
    const key = await freshKey();
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = await signQrToken({ studentId, cardVersion, expUnix: past, key });
    const r = await verifyQrToken(token, key);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('expired');
  });

  it('accepts expired when ignoreExpiry', async () => {
    const key = await freshKey();
    const past = Math.floor(Date.now() / 1000) - 10;
    const token = await signQrToken({ studentId, cardVersion, expUnix: past, key });
    const r = await verifyQrToken(token, key, { ignoreExpiry: true });
    expect(r.ok).toBe(true);
  });

  it('rejects malformed token', async () => {
    const key = await freshKey();
    const r = await verifyQrToken('garbage', key);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('malformed');
  });

  it('rejects tampered cardVersion', async () => {
    const key = await freshKey();
    const token = await signQrToken({ studentId, cardVersion: 1, expUnix, key });
    const tampered = token.replace(/\.1\./, '.2.');
    const r = await verifyQrToken(tampered, key);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad_signature');
  });

  it('rejects studentId containing "."', async () => {
    const key = await freshKey();
    await expect(
      signQrToken({ studentId: 'bad.id', cardVersion: 1, expUnix, key })
    ).rejects.toThrow();
  });
});

describe('generateHmacSecretBytes', () => {
  it('produces 32 bytes by default', () => {
    expect(generateHmacSecretBytes().length).toBe(32);
  });
  it('rejects byteLength out of range', () => {
    expect(() => generateHmacSecretBytes(8)).toThrow();
    expect(() => generateHmacSecretBytes(128)).toThrow();
  });
});
