// Local 6-digit password generator for students (SRS §8.2).
// Uses Web Crypto (available on Hermes via expo) for an unbiased digit.
// Mirrors `generateStudentPassword` in packages/shared-utils — kept local
// to avoid pulling the monorepo workspace package into the Expo bundle until
// the cloud-sync unit (U24) adds proper @shared aliasing through Metro.

function unbiasedDigit(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) {
    // Non-cryptographic fallback for dev surfaces (e.g. web preview without polyfill).
    return String(Math.floor(Math.random() * 10));
  }
  const buf = new Uint8Array(1);
  // Rejection sampling: 250 = floor(256/10)*10, so values 0..249 map evenly to 0..9.
  // The loop has expected ≤1.024 iterations.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    c.getRandomValues(buf);
    if (buf[0]! < 250) return String(buf[0]! % 10);
  }
}

export function generateStudentPassword(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += unbiasedDigit();
  return out;
}
