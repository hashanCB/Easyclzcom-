import { describe, expect, it } from 'vitest';
import {
  addMonthsToKey,
  compareMonthKeys,
  isWithinClassWindow,
  isoDate,
  monthKey,
  monthRange,
  parseTimeOfDay,
  timeOfDayToMinutes,
} from '../date.js';

describe('monthKey', () => {
  it('returns YYYY-MM in Asia/Colombo by default', () => {
    expect(monthKey(new Date('2026-05-07T03:00:00Z'))).toBe('2026-05');
  });

  it('respects local TZ at month boundary', () => {
    const utc = new Date('2026-04-30T19:30:00Z');
    expect(monthKey(utc, { tz: 'Asia/Colombo' })).toBe('2026-05');
    expect(monthKey(utc, { tz: 'UTC' })).toBe('2026-04');
  });

  it('accepts ISO string input', () => {
    expect(monthKey('2026-01-15T08:00:00Z', { tz: 'UTC' })).toBe('2026-01');
  });
});

describe('isoDate', () => {
  it('returns YYYY-MM-DD in target TZ', () => {
    expect(isoDate('2026-05-07T03:00:00Z', { tz: 'Asia/Colombo' })).toBe('2026-05-07');
  });

  it('handles TZ offset crossing day boundary', () => {
    expect(isoDate('2026-05-07T19:00:00Z', { tz: 'Asia/Colombo' })).toBe('2026-05-08');
    expect(isoDate('2026-05-07T19:00:00Z', { tz: 'UTC' })).toBe('2026-05-07');
  });
});

describe('addMonthsToKey', () => {
  it('adds positive months', () => {
    expect(addMonthsToKey('2026-01', 2)).toBe('2026-03');
    expect(addMonthsToKey('2026-11', 3)).toBe('2027-02');
  });
  it('subtracts negative months', () => {
    expect(addMonthsToKey('2026-03', -5)).toBe('2025-10');
  });
  it('zero is identity', () => {
    expect(addMonthsToKey('2026-05', 0)).toBe('2026-05');
  });
  it('throws on invalid key', () => {
    expect(() => addMonthsToKey('2026-13', 0)).not.toThrow();
    expect(() => addMonthsToKey('not-a-key', 0)).toThrow();
  });
});

describe('monthRange', () => {
  it('inclusive range', () => {
    expect(monthRange('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
  });
  it('single-month range', () => {
    expect(monthRange('2026-05', '2026-05')).toEqual(['2026-05']);
  });
});

describe('compareMonthKeys', () => {
  it('orders correctly', () => {
    expect(compareMonthKeys('2026-01', '2026-02')).toBe(-1);
    expect(compareMonthKeys('2026-02', '2026-02')).toBe(0);
    expect(compareMonthKeys('2026-03', '2026-02')).toBe(1);
  });
});

describe('parseTimeOfDay / timeOfDayToMinutes', () => {
  it('parses HH:mm', () => {
    expect(parseTimeOfDay('08:30')).toEqual({ hour: 8, minute: 30 });
  });
  it('rejects invalid formats', () => {
    expect(() => parseTimeOfDay('8:30')).toThrow();
    expect(() => parseTimeOfDay('24:00')).toThrow();
    expect(() => parseTimeOfDay('12:60')).toThrow();
  });
  it('converts to minutes', () => {
    expect(timeOfDayToMinutes('00:00')).toBe(0);
    expect(timeOfDayToMinutes('08:30')).toBe(510);
    expect(timeOfDayToMinutes('23:59')).toBe(23 * 60 + 59);
  });
});

describe('isWithinClassWindow (SRS §12.6)', () => {
  const opts = {
    classStart: '08:00',
    classEnd: '10:00',
    graceMinutesBefore: 30,
    graceMinutesAfter: 30,
    tz: 'Asia/Colombo',
  };

  it('inside window: 08:30 local', () => {
    const r = isWithinClassWindow({ ...opts, now: new Date('2026-05-07T03:00:00Z') });
    expect(r.withinWindow).toBe(true);
    expect(r.isLate).toBe(false);
    expect(r.isEarly).toBe(false);
  });

  it('early grace: 07:35 local (5 min after window opens)', () => {
    const r = isWithinClassWindow({ ...opts, now: new Date('2026-05-07T02:05:00Z') });
    expect(r.withinWindow).toBe(true);
    expect(r.isEarly).toBe(true);
  });

  it('late grace: 10:15 local', () => {
    const r = isWithinClassWindow({ ...opts, now: new Date('2026-05-07T04:45:00Z') });
    expect(r.withinWindow).toBe(true);
    expect(r.isLate).toBe(true);
  });

  it('after window closed: 10:45', () => {
    const r = isWithinClassWindow({ ...opts, now: new Date('2026-05-07T05:15:00Z') });
    expect(r.withinWindow).toBe(false);
  });

  it('before window opens: 07:00', () => {
    const r = isWithinClassWindow({ ...opts, now: new Date('2026-05-07T01:30:00Z') });
    expect(r.withinWindow).toBe(false);
  });
});
