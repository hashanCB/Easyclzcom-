// Numeric / character generators — Deno-friendly twin of shared-utils' helpers.
// We re-implement here (rather than import) because edge functions ship to
// Deno and shared-utils is a Node/Vite package.

const NUMERIC = '0123456789';

function randomFromAlphabet(alphabet: string, length: number): string {
  const out = new Array<string>(length);
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) {
    out[i] = alphabet[buf[i] % alphabet.length];
  }
  return out.join('');
}

export function generateActivationToken(): string {
  return randomFromAlphabet(NUMERIC, 12);
}

export function generateTeacherPassword(): string {
  // 14-char alphanumeric with mixed case + digits — enough entropy for a
  // password the super admin reads off once and the teacher rotates on first
  // login. Avoids visually ambiguous chars.
  return randomFromAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', 14);
}

export function generateAssistantPassword(): string {
  return randomFromAlphabet(NUMERIC, 8);
}
