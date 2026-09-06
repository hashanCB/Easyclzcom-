/**
 * formatClassDays — converts the DB class_day string to a readable short label.
 *
 * Examples:
 *   'monday'                   → 'Mon'
 *   'monday,wednesday'         → 'Mon/Wed'
 *   'monday,wednesday,friday'  → 'Mon/Wed/Fri'
 *   'saturday,sunday'          → 'Sat/Sun'
 */
export function formatClassDays(classDay: string): string {
  return classDay
    .split(',')
    .map((d) => {
      const t = d.trim();
      return t.charAt(0).toUpperCase() + t.slice(1, 3);
    })
    .join('/');
}

/**
 * Returns true if the given weekday name (e.g. 'monday') is one of the
 * class days stored in the comma-separated classDay string.
 */
export function classIsOnDay(classDay: string, weekday: string): boolean {
  return classDay
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .includes(weekday.toLowerCase());
}

export interface DayScheduleEntry {
  day: string;
  start: string;
  end: string;
}

/**
 * Parse the class_schedule JSON column into an array of day schedule entries.
 * Returns an empty array if the value is null/empty/invalid.
 */
export function parseClassSchedule(classSchedule: string | null | undefined): DayScheduleEntry[] {
  if (!classSchedule) return [];
  try {
    const parsed = JSON.parse(classSchedule);
    if (Array.isArray(parsed)) return parsed as DayScheduleEntry[];
  } catch {}
  return [];
}

/**
 * Get the start/end time for a specific day, falling back to the shared
 * class_start_time / class_end_time if no per-day entry exists.
 */
export function getScheduleForDay(
  classSchedule: string | null | undefined,
  day: string,
  fallbackStart: string,
  fallbackEnd: string,
): { start: string; end: string } {
  const entries = parseClassSchedule(classSchedule);
  const entry = entries.find((e) => e.day.toLowerCase() === day.toLowerCase());
  if (entry) return { start: entry.start, end: entry.end };
  return { start: fallbackStart, end: fallbackEnd };
}

/**
 * Compact schedule label for class list cards.
 *
 * - All days share the same time  →  "Mon/Wed · 14:00–16:00"
 * - Different times per day       →  "Mon 14:00–16:00 · Wed 09:00–11:00"
 */
export function formatClassScheduleLabel(
  classDay: string,
  classSchedule: string | null | undefined,
  fallbackStart: string,
  fallbackEnd: string,
): string {
  const days = classDay.split(',').map((d) => d.trim()).filter(Boolean);
  if (days.length === 0) return '';

  const entries = parseClassSchedule(classSchedule);

  const slots = days.map((day) => {
    const entry = entries.find((e) => e.day.toLowerCase() === day.toLowerCase());
    return {
      label: day.charAt(0).toUpperCase() + day.slice(1, 3),
      start: entry?.start ?? fallbackStart,
      end: entry?.end ?? fallbackEnd,
    };
  });

  const allSame = slots.every((s) => s.start === slots[0].start && s.end === slots[0].end);

  if (allSame) {
    return `${slots.map((s) => s.label).join('/')} · ${slots[0].start}–${slots[0].end}`;
  }

  return slots.map((s) => `${s.label} ${s.start}–${s.end}`).join(' · ');
}
