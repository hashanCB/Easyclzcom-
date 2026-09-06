// =============================================================================
// attendanceWindow — when may a teacher mark attendance for a class?
// =============================================================================
// Rules (shared by manual marking, QR scan, and extra classes):
//   1. Only TODAY can be marked — never a past or future day.
//   2. The class must be scheduled on today's weekday (e.g. an ICT class that
//      runs on Sunday is only markable on Sunday).
//   3. Marking opens at  (today's start time − qr_grace_minutes_before)  and
//      stays open until the END OF THE DAY (midnight) — so once it opens it
//      remains open for the rest of that day.
// =============================================================================

import { classIsOnDay, getScheduleForDay } from './formatDays';

const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

/** Lowercase weekday name for the given date (defaults to now). */
export function dayName(now: Date = new Date()): string {
  return DAY_NAMES[now.getDay()];
}

/** Local YYYY-MM-DD for the given date (defaults to now). */
export function isoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** True when the given YYYY-MM-DD string is today. */
export function isToday(dateIso: string, now: Date = new Date()): boolean {
  return dateIso === isoDate(now);
}

export interface ClassWindowConfig {
  classDay: string;                 // comma-separated weekday name(s)
  classSchedule?: string | null;    // optional per-day JSON
  classStartTime: string;           // HH:MM fallback
  classEndTime: string;             // HH:MM fallback
  qrGraceMinutesBefore?: number | null;
}

/** Does this class have a session on today's weekday? */
export function classMeetsToday(c: { classDay: string }, now: Date = new Date()): boolean {
  return classIsOnDay(c.classDay, dayName(now));
}

export type MarkGate =
  | { ok: true }
  | { ok: false; reason: 'not_today_day' | 'too_early'; message: string };

function fmtMins(total: number): string {
  // total is minutes-from-midnight; clamp into a sane 12h label.
  const mins = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

/**
 * Whether the teacher can mark attendance for this class RIGHT NOW (today).
 * Closes at end of the day, so the only blockers are "not a class day" and
 * "too early" (before start − grace).
 */
export function attendanceMarkGate(c: ClassWindowConfig, now: Date = new Date()): MarkGate {
  const day = dayName(now);
  if (!classIsOnDay(c.classDay, day)) {
    return { ok: false, reason: 'not_today_day', message: 'This class is not scheduled today.' };
  }
  const { start } = getScheduleForDay(c.classSchedule, day, c.classStartTime, c.classEndTime);
  const [sh, sm] = start.split(':').map(Number);
  const openMins = sh * 60 + sm - (c.qrGraceMinutesBefore ?? 30);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins < openMins) {
    return { ok: false, reason: 'too_early', message: `Marking opens at ${fmtMins(openMins)}.` };
  }
  return { ok: true };
}

/**
 * Extra (one-off) classes are pinned to a specific calendar date rather than a
 * weekday. Same spirit: only on the class date, and (if it has a start time)
 * only once start − grace has passed; open until end of that day.
 */
export function extraClassMarkGate(
  date: string,
  startTime: string | null | undefined,
  now: Date = new Date(),
  graceMinutes = 30,
): MarkGate {
  if (!isToday(date, now)) {
    return { ok: false, reason: 'not_today_day', message: `You can only mark on the class date (${date}).` };
  }
  if (startTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const openMins = sh * 60 + sm - graceMinutes;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if (nowMins < openMins) {
      return { ok: false, reason: 'too_early', message: `Marking opens at ${fmtMins(openMins)}.` };
    }
  }
  return { ok: true };
}
