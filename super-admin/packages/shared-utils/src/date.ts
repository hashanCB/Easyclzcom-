export const DEFAULT_TIMEZONE = 'Asia/Colombo';

export interface TzOptions {
  tz?: string;
}

function partsInTz(d: Date, tz: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

export function monthKey(date: Date | string = new Date(), opts: TzOptions = {}): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const { tz = DEFAULT_TIMEZONE } = opts;
  const p = partsInTz(d, tz);
  return `${p.year}-${p.month}`;
}

export function isoDate(date: Date | string = new Date(), opts: TzOptions = {}): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const { tz = DEFAULT_TIMEZONE } = opts;
  const p = partsInTz(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function currentMonthKey(opts: TzOptions = {}): string {
  return monthKey(new Date(), opts);
}

export function todayIsoDate(opts: TzOptions = {}): string {
  return isoDate(new Date(), opts);
}

export function addMonthsToKey(key: string, n: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`addMonthsToKey: invalid month key "${key}"`);
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const total = year * 12 + month + n;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth + 1).padStart(2, '0')}`;
}

export function monthRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cur = fromKey;
  while (compareMonthKeys(cur, toKey) <= 0) {
    out.push(cur);
    cur = addMonthsToKey(cur, 1);
    if (out.length > 600) throw new Error('monthRange: too many months');
  }
  return out;
}

export function compareMonthKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function parseTimeOfDay(hhmm: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`parseTimeOfDay: invalid HH:mm "${hhmm}"`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function timeOfDayToMinutes(hhmm: string): number {
  const { hour, minute } = parseTimeOfDay(hhmm);
  return hour * 60 + minute;
}

export interface ClassWindowOptions {
  classStart: string;
  classEnd: string;
  graceMinutesBefore: number;
  graceMinutesAfter: number;
  now?: Date;
  tz?: string;
}

export function isWithinClassWindow(opts: ClassWindowOptions): {
  withinWindow: boolean;
  isLate: boolean;
  isEarly: boolean;
  minutesUntilStart: number;
  minutesPastEnd: number;
} {
  const { classStart, classEnd, graceMinutesBefore, graceMinutesAfter, now = new Date(), tz = DEFAULT_TIMEZONE } = opts;
  const startMins = timeOfDayToMinutes(classStart);
  const endMins = timeOfDayToMinutes(classEnd);
  const p = partsInTz(now, tz);
  const nowMins = Number(p.hour) * 60 + Number(p.minute);

  const windowStart = startMins - graceMinutesBefore;
  const windowEnd = endMins + graceMinutesAfter;

  return {
    withinWindow: nowMins >= windowStart && nowMins <= windowEnd,
    isLate: nowMins > endMins && nowMins <= windowEnd,
    isEarly: nowMins < startMins && nowMins >= windowStart,
    minutesUntilStart: startMins - nowMins,
    minutesPastEnd: nowMins - endMins,
  };
}

export function nowIsoUtc(): string {
  return new Date().toISOString();
}
