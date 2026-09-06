// Unit tests for student OTP/phone helpers.
// Run with:  deno test --allow-none supabase/functions/__tests__/student-otp.test.ts

import {
  assertEquals,
  assertMatch,
  assertNotEquals,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  toLocalLK,
  generateOtp,
  hashOtp,
  checkRateLimit,
} from '../_shared/student-otp.ts';

// ─────────────────────────────────────────────────────────────────────────────
// toLocalLK — phone normalisation
// (Critical: all edge functions now use this before every DB read/write)
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('toLocalLK: converts +94 international to 07 local', () => {
  assertEquals(toLocalLK('+94716905898'), '0716905898');
  assertEquals(toLocalLK('+94771234567'), '0771234567');
  assertEquals(toLocalLK('+94712345678'), '0712345678');
});

Deno.test('toLocalLK: leaves already-local 07XXXXXXXXX unchanged', () => {
  assertEquals(toLocalLK('0716905898'), '0716905898');
  assertEquals(toLocalLK('0771234567'), '0771234567');
});

Deno.test('toLocalLK: handles +94 with spaces/dashes stripped', () => {
  // digits-only extraction should still work
  assertEquals(toLocalLK('+94-71-6905898'), '0716905898');
});

Deno.test('toLocalLK: passes through unknown format unchanged', () => {
  // Non-LK numbers — let text.lk validate
  assertEquals(toLocalLK('+12025551234').trim(), '+12025551234');
  assertEquals(toLocalLK('invalid').trim(), 'invalid');
});

Deno.test('toLocalLK: 9-digit input (no leading zero, +94 prefix via UI) round-trips', () => {
  // UI sends '+94' + 9 digits; normalise back to local
  const uiInput = '+94' + '716905898'; // what the frontend constructs
  assertEquals(toLocalLK(uiInput), '0716905898');
});

// ── Additional normalisation cases (Bug-fix coverage: DB phone format mismatch) ─

Deno.test('toLocalLK: 94XXXXXXXXX without + prefix still converts (digits-only input)', () => {
  // Some systems strip the leading '+' — still 11 digits starting with 94
  assertEquals(toLocalLK('94716905898'), '0716905898');
  assertEquals(toLocalLK('94771234567'), '0771234567');
});

Deno.test('toLocalLK: +94 with spaces between groups converts correctly', () => {
  // E.g. "+94 71 234 5678" — spaces stripped, then 11 digits
  assertEquals(toLocalLK('+94 71 690 5898'), '0716905898');
});

Deno.test('toLocalLK: idempotent — normalising an already-normalised number is safe', () => {
  const once  = toLocalLK('+94716905898');  // '0716905898'
  const twice = toLocalLK(once);            // already '07...', should stay
  assertEquals(once, '0716905898');
  assertEquals(twice, '0716905898');
});

Deno.test('toLocalLK: too-short 07 prefix (< 10 digits) passes through unchanged', () => {
  // '077777777' has 9 digits — not a valid local number, not mutated
  assertEquals(toLocalLK('077777777').trim(), '077777777');
});

Deno.test('toLocalLK: too-short +94 (< 11 digits total) passes through unchanged', () => {
  // Only 10 total digits starting with 94 — not a valid +94 number
  assertEquals(toLocalLK('+9471690589').trim(), '+9471690589');
});

Deno.test('toLocalLK: empty string passes through unchanged', () => {
  assertEquals(toLocalLK(''), '');
});

Deno.test('toLocalLK: all common LK networks normalise correctly', () => {
  // Dialog, Mobitel, Hutch, Airtel — all start with 07
  const numbers = [
    ['+94711234567', '0711234567'], // Dialog
    ['+94771234567', '0771234567'], // Mobitel
    ['+94781234567', '0781234567'], // Hutch
    ['+94751234567', '0751234567'], // Airtel
    ['+94701234567', '0701234567'], // SLT Mobitel prepaid
  ];
  for (const [input, expected] of numbers) {
    assertEquals(toLocalLK(input), expected, `failed for ${input}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// generateOtp
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('generateOtp: produces a 6-character string', () => {
  for (let i = 0; i < 20; i++) {
    const otp = generateOtp();
    assertEquals(otp.length, 6, `OTP "${otp}" is not 6 chars`);
  }
});

Deno.test('generateOtp: contains only digits', () => {
  for (let i = 0; i < 20; i++) {
    const otp = generateOtp();
    assertMatch(otp, /^\d{6}$/, `OTP "${otp}" contains non-digits`);
  }
});

Deno.test('generateOtp: zero-pads small values (statistical check)', () => {
  // Run 500 times — statistically near-certain to hit a value < 100000
  // which would be wrong without zero-padding.
  const otps = Array.from({ length: 500 }, () => generateOtp());
  for (const otp of otps) {
    assertEquals(otp.length, 6);
  }
});

Deno.test('generateOtp: values are within range 000000–999999', () => {
  for (let i = 0; i < 50; i++) {
    const n = parseInt(generateOtp(), 10);
    assert(n >= 0 && n <= 999999, `OTP ${n} out of range`);
  }
});

Deno.test('generateOtp: produces different values on successive calls', () => {
  const set = new Set(Array.from({ length: 50 }, () => generateOtp()));
  assert(set.size > 10, 'All 50 OTPs were identical — RNG appears broken');
});

// ─────────────────────────────────────────────────────────────────────────────
// hashOtp
// ─────────────────────────────────────────────────────────────────────────────

Deno.test('hashOtp: returns 64-character lowercase hex string', async () => {
  const h = await hashOtp('123456');
  assertEquals(h.length, 64);
  assertMatch(h, /^[0-9a-f]{64}$/);
});

Deno.test('hashOtp: same input always produces same hash (deterministic)', async () => {
  const h1 = await hashOtp('654321');
  const h2 = await hashOtp('654321');
  assertEquals(h1, h2);
});

Deno.test('hashOtp: different inputs produce different hashes', async () => {
  const h1 = await hashOtp('000000');
  const h2 = await hashOtp('000001');
  assertNotEquals(h1, h2);
});

Deno.test('hashOtp: known SHA-256 vector (empty string)', async () => {
  // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  const h = await hashOtp('');
  assertEquals(h, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

Deno.test('hashOtp: a freshly-generated OTP hashes correctly', async () => {
  const otp = generateOtp();
  const h = await hashOtp(otp);
  assertEquals(h.length, 64);
  // Verify round-trip: hashing the same value again matches.
  assertEquals(h, await hashOtp(otp));
});

Deno.test('hashOtp: hashing a normalised phone matches re-hash of same phone', async () => {
  // Confirms that toLocalLK output feeds consistently into hashOtp
  // (used in OTP verification flows)
  const phone = toLocalLK('+94716905898'); // '0716905898'
  const h1 = await hashOtp(phone);
  const h2 = await hashOtp('0716905898');  // same value directly
  assertEquals(h1, h2);
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRateLimit
// ─────────────────────────────────────────────────────────────────────────────

const THIS_MONTH = new Date().toISOString().slice(0, 7); // e.g. '2026-05'
const LAST_MONTH = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

Deno.test('checkRateLimit: allows first action (null stored values)', () => {
  const { allowed, newCount } = checkRateLimit(null, null, THIS_MONTH, 2);
  assertEquals(allowed, true);
  assertEquals(newCount, 1);
});

Deno.test('checkRateLimit: allows when count is below limit in same month', () => {
  const { allowed, newCount } = checkRateLimit(THIS_MONTH, 1, THIS_MONTH, 2);
  assertEquals(allowed, true);
  assertEquals(newCount, 2);
});

Deno.test('checkRateLimit: blocks when count equals limit in same month', () => {
  const { allowed } = checkRateLimit(THIS_MONTH, 2, THIS_MONTH, 2);
  assertEquals(allowed, false);
});

Deno.test('checkRateLimit: blocks when count exceeds limit', () => {
  const { allowed } = checkRateLimit(THIS_MONTH, 5, THIS_MONTH, 2);
  assertEquals(allowed, false);
});

Deno.test('checkRateLimit: resets counter when month rolls over', () => {
  // Month changed → treat as 0 even though storedCount=2
  const { allowed, newCount } = checkRateLimit(LAST_MONTH, 2, THIS_MONTH, 2);
  assertEquals(allowed, true);
  assertEquals(newCount, 1);
});

Deno.test('checkRateLimit: resets when storedMonth is null (first ever use)', () => {
  const { allowed, newCount } = checkRateLimit(null, 0, THIS_MONTH, 2);
  assertEquals(allowed, true);
  assertEquals(newCount, 1);
});

Deno.test('checkRateLimit: works with limit=1 (strict mode)', () => {
  const first = checkRateLimit(THIS_MONTH, 0, THIS_MONTH, 1);
  assertEquals(first.allowed, true);
  const second = checkRateLimit(THIS_MONTH, 1, THIS_MONTH, 1);
  assertEquals(second.allowed, false);
});

Deno.test('checkRateLimit: returns correct newCount when blocked', () => {
  const { allowed, newCount } = checkRateLimit(THIS_MONTH, 2, THIS_MONTH, 2);
  assertEquals(allowed, false);
  assertEquals(newCount, 2); // unchanged when blocked
});

// ── Additional checkRateLimit cases (Feature: grant extra changes) ────────────

Deno.test('checkRateLimit: resetting count to 0 in same month allows again (grant extra attempts)', () => {
  // Simulates admin resetting phone_change_count = 0 for a student who hit limit
  const afterReset = checkRateLimit(THIS_MONTH, 0, THIS_MONTH, 2);
  assertEquals(afterReset.allowed, true);
  assertEquals(afterReset.newCount, 1);
});

Deno.test('checkRateLimit: high limit (99) always allows up to 99 in same month', () => {
  // Used internally by confirm_phone_change for counter-only increment (no real limit)
  const { allowed } = checkRateLimit(THIS_MONTH, 98, THIS_MONTH, 99);
  assertEquals(allowed, true);
  const { allowed: blocked } = checkRateLimit(THIS_MONTH, 99, THIS_MONTH, 99);
  assertEquals(blocked, false);
});

Deno.test('checkRateLimit: storedCount of null treated as 0', () => {
  // DB column might be null if never set
  const { allowed, newCount } = checkRateLimit(THIS_MONTH, null, THIS_MONTH, 2);
  assertEquals(allowed, true);
  assertEquals(newCount, 1);
});

Deno.test('checkRateLimit: two months ago also resets correctly', () => {
  const twoMonthsAgo = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d.toISOString().slice(0, 7);
  })();
  const { allowed, newCount } = checkRateLimit(twoMonthsAgo, 2, THIS_MONTH, 2);
  assertEquals(allowed, true);
  assertEquals(newCount, 1);
});
