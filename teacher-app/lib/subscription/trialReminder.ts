// Once-per-day "you're on a free trial — upgrade your plan" nudge.
// Every teacher gets a 14-day trial on signup and must pay afterwards (there is
// no free tier). During the trial we remind them once each calendar day to pick
// a plan, so the trial ending is never a surprise.
import { storage } from '../storage';
import { SECURE_STORE } from '../constants';

/** Local calendar day, e.g. "2026-06-06". */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function storeKey(teacherId: string): string {
  return `${SECURE_STORE.TRIAL_REMINDER_SHOWN}_${teacherId}`;
}

/** True when the trial reminder has not yet been shown today for this teacher. */
export async function shouldShowTrialReminderToday(teacherId: string): Promise<boolean> {
  const last = await storage.getItem(storeKey(teacherId));
  return last !== todayKey();
}

/** Record that today's trial reminder has been shown. */
export async function markTrialReminderShown(teacherId: string): Promise<void> {
  await storage.setItem(storeKey(teacherId), todayKey());
}
