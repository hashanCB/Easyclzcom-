import { describe, expect, it } from 'vitest';
import {
  buildYearlyMotivationText,
  centsToYearly,
  diffCents,
  formatMoney,
  parseMoneyToCents,
  sumCents,
} from '../money.js';

describe('formatMoney', () => {
  it('formats LKR by default with currency symbol', () => {
    const out = formatMoney(150000);
    expect(out).toMatch(/1,500\.00/);
    expect(out).toMatch(/Rs|LKR/);
  });

  it('honours showSymbol=false', () => {
    expect(formatMoney(150000, { showSymbol: false })).toBe('1,500.00');
  });

  it('formats zero', () => {
    expect(formatMoney(0, { showSymbol: false })).toBe('0.00');
  });

  it('honours fractionDigits=0', () => {
    expect(formatMoney(150000, { showSymbol: false, fractionDigits: 0 })).toBe('1,500');
  });

  it('formats other currencies', () => {
    const out = formatMoney(100, { currency: 'USD', locale: 'en-US' });
    expect(out).toMatch(/\$1\.00/);
  });
});

describe('parseMoneyToCents', () => {
  it('parses numeric input', () => {
    expect(parseMoneyToCents(15)).toBe(1500);
    expect(parseMoneyToCents(15.25)).toBe(1525);
  });

  it('parses string with currency symbols', () => {
    expect(parseMoneyToCents('Rs. 1,500.00')).toBe(150000);
    expect(parseMoneyToCents('$ 1,234.56')).toBe(123456);
  });

  it('rounds correctly to nearest cent', () => {
    expect(parseMoneyToCents(0.005)).toBe(1);
    expect(parseMoneyToCents(0.004)).toBe(0);
  });

  it('throws on invalid input', () => {
    expect(() => parseMoneyToCents('abc')).toThrow();
    expect(() => parseMoneyToCents(NaN)).toThrow();
  });
});

describe('centsToYearly', () => {
  it('multiplies by 12', () => {
    expect(centsToYearly(100000)).toBe(1200000);
    expect(centsToYearly(0)).toBe(0);
  });
});

describe('buildYearlyMotivationText', () => {
  it('produces SRS §7.6 motivation text', () => {
    const text = buildYearlyMotivationText(100000);
    expect(text).toContain('per year');
    expect(text).toMatch(/12,000\.00/);
  });
});

describe('sumCents', () => {
  it('sums integers', () => {
    expect(sumCents([100, 200, 300])).toBe(600);
    expect(sumCents([])).toBe(0);
  });
  it('throws on non-integer values', () => {
    expect(() => sumCents([1.5, 2])).toThrow();
  });
});

describe('diffCents', () => {
  it('subtracts integers', () => {
    expect(diffCents(500, 200)).toBe(300);
    expect(diffCents(100, 200)).toBe(-100);
  });
});
