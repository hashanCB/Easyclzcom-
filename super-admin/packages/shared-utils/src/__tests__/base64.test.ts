import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url, bytesToUtf8, utf8ToBytes } from '../base64.js';

describe('base64url round-trip', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const enc = bytesToBase64Url(bytes);
    expect(enc).not.toContain('+');
    expect(enc).not.toContain('/');
    expect(enc).not.toContain('=');
    expect(Array.from(base64UrlToBytes(enc))).toEqual(Array.from(bytes));
  });

  it('round-trips utf8 strings', () => {
    const original = 'Hello, 世界 🌏';
    const enc = bytesToBase64Url(utf8ToBytes(original));
    expect(bytesToUtf8(base64UrlToBytes(enc))).toBe(original);
  });

  it('handles empty input', () => {
    expect(bytesToBase64Url(new Uint8Array())).toBe('');
    expect(base64UrlToBytes('').length).toBe(0);
  });
});
