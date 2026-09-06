export const DEFAULT_CURRENCY = 'LKR';
export const DEFAULT_LOCALE = 'en-LK';
export const MONTHS_PER_YEAR = 12;

export interface FormatMoneyOptions {
  currency?: string;
  locale?: string;
  showSymbol?: boolean;
  fractionDigits?: number;
}

export function formatMoney(cents: number, opts: FormatMoneyOptions = {}): string {
  const {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    showSymbol = true,
    fractionDigits = 2,
  } = opts;

  const value = cents / 100;

  if (showSymbol) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function parseMoneyToCents(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('parseMoneyToCents: invalid number');
    return Math.round(input * 100);
  }
  const isNegative = /-/.test(input);
  const stripped = input.replace(/[^\d.]/g, '');
  const lastDot = stripped.lastIndexOf('.');
  const normalized =
    lastDot === -1
      ? stripped
      : stripped.slice(0, lastDot).replace(/\./g, '') + '.' + stripped.slice(lastDot + 1);
  if (normalized === '' || normalized === '.') {
    throw new Error(`parseMoneyToCents: cannot parse "${input}"`);
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`parseMoneyToCents: cannot parse "${input}"`);
  }
  return Math.round((isNegative ? -value : value) * 100);
}

export function centsToYearly(monthlyFeeCents: number): number {
  return monthlyFeeCents * MONTHS_PER_YEAR;
}

export function buildYearlyMotivationText(
  monthlyFeeCents: number,
  opts: FormatMoneyOptions = {}
): string {
  const yearly = centsToYearly(monthlyFeeCents);
  return `One student can earn ${formatMoney(yearly, opts)} per year.`;
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error('sumCents: values must be integers (cents)');
    total += v;
  }
  return total;
}

export function diffCents(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error('diffCents: arguments must be integers (cents)');
  }
  return a - b;
}
