// Student OTP and phone-number helpers shared across student edge functions.
// Extracted so they can be unit-tested independently via `deno test`.

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------

/**
 * text.lk requires local format 07XXXXXXXXX (10 digits, no +94 prefix).
 * Converts +94XXXXXXXXX → 07XXXXXXXXX; already-local numbers pass through.
 */
export function toLocalLK(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) return '0' + digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) return digits;
  return phone.trim();
}

/**
 * A format-agnostic key for comparing two phone numbers for "same person".
 * Strips everything but digits and keeps the last 9 (the subscriber part of a
 * Sri Lankan mobile, 7XXXXXXXX), so 0716905898, +94716905898, 94716905898 and
 * "071 690 5898" all collapse to the same key. Used to merge a student's
 * account with a teacher's manually-added record regardless of how the teacher
 * typed the number. Returns '' for numbers with fewer than 9 digits (won't
 * match a real number, avoiding false merges).
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
}

// ---------------------------------------------------------------------------
// OTP generation & hashing
// ---------------------------------------------------------------------------

/** Generate a cryptographically random 6-digit OTP string (zero-padded). */
export function generateOtp(): string {
  const n = new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getUint32(0, false);
  return String(n % 1_000_000).padStart(6, '0');
}

/** SHA-256 hash of an OTP string, returned as lowercase hex. */
export async function hashOtp(otp: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(otp));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Rate-limit helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a monthly-rate-limited action is allowed and what the
 * new counter value should be.
 *
 * @param storedMonth  The 'YYYY-MM' string currently on the DB row (or null).
 * @param storedCount  The count currently on the DB row (or null).
 * @param currentMonth The current 'YYYY-MM' string.
 * @param limit        Maximum number of actions per calendar month.
 * @returns `{ allowed, newCount }` — newCount is the post-increment value.
 */
export function checkRateLimit(
  storedMonth: string | null | undefined,
  storedCount: number | null | undefined,
  currentMonth: string,
  limit: number,
): { allowed: boolean; newCount: number } {
  const sameMonth = storedMonth === currentMonth;
  const count = sameMonth ? (storedCount ?? 0) : 0;
  if (count >= limit) return { allowed: false, newCount: count };
  return { allowed: true, newCount: count + 1 };
}
