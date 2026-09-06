import { describe, expect, it } from 'vitest';
import {
  generateActivationToken,
  generateAssistantPassword,
  generateIdempotencyKey,
  generateNumericPassword,
  generateStudentCode,
  generateStudentPassword,
  randomUuid,
  ulid,
} from '../id.js';

describe('randomUuid', () => {
  it('returns RFC4122 v4 UUID format', () => {
    const u = randomUuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => randomUuid()));
    expect(set.size).toBe(100);
  });
});

describe('ulid', () => {
  it('returns 26-char Crockford base32', () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it('is unique across rapid calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => ulid()));
    expect(set.size).toBe(100);
  });
  it('is time-sortable', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_800_000_000_000);
    expect(a < b).toBe(true);
  });
});

describe('generateNumericPassword', () => {
  it('respects digit count', () => {
    expect(generateNumericPassword(6)).toMatch(/^\d{6}$/);
    expect(generateNumericPassword(8)).toMatch(/^\d{8}$/);
    expect(generateNumericPassword(12)).toMatch(/^\d{12}$/);
  });
  it('rejects out-of-range digit counts', () => {
    expect(() => generateNumericPassword(0)).toThrow();
    expect(() => generateNumericPassword(33)).toThrow();
    expect(() => generateNumericPassword(1.5)).toThrow();
  });
  it('produces well-distributed digits', () => {
    const sample = Array.from({ length: 100 }, () => generateNumericPassword(10)).join('');
    const counts = new Map<string, number>();
    for (const c of sample) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (let d = 0; d < 10; d++) {
      const count = counts.get(String(d)) ?? 0;
      expect(count).toBeGreaterThan(50);
      expect(count).toBeLessThan(150);
    }
  });
});

describe('password helpers', () => {
  it('student password is 6 digits', () => {
    expect(generateStudentPassword()).toMatch(/^\d{6}$/);
  });
  it('assistant password is 8 digits', () => {
    expect(generateAssistantPassword()).toMatch(/^\d{8}$/);
  });
  it('activation token is 12 digits', () => {
    expect(generateActivationToken()).toMatch(/^\d{12}$/);
  });
});

describe('generateStudentCode', () => {
  it('uses default prefix S- and 6-char segment', () => {
    expect(generateStudentCode()).toMatch(/^S-[A-Z0-9]{6}$/);
  });
  it('honours custom prefix and length', () => {
    expect(generateStudentCode({ prefix: 'STU', segmentLength: 8 })).toMatch(/^STU-[A-Z0-9]{8}$/);
  });
  it('does not use ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateStudentCode().split('-')[1]!;
      expect(code).not.toMatch(/[ILO01]/);
    }
  });
  it('rejects invalid segmentLength', () => {
    expect(() => generateStudentCode({ segmentLength: 3 })).toThrow();
    expect(() => generateStudentCode({ segmentLength: 13 })).toThrow();
  });
});

describe('generateIdempotencyKey', () => {
  it('returns a ULID', () => {
    expect(generateIdempotencyKey()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
