// Token hashing — must match the format used in U06 seed:
//   token_hash = lower(hex(sha256(plaintext)))

const encoder = new TextEncoder();

export async function hashToken(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(plaintext));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Synthetic email used by Supabase Auth when the SRS only specifies username.
// Keep it outside any real domain so it can never collide with a real address.
export function usernameToAuthEmail(username: string): string {
  return `${username.toLowerCase()}@teachers.local`;
}

export function usernameToAssistantEmail(username: string): string {
  return `${username.toLowerCase()}@assistants.local`;
}

// ---- Student password hashing (PBKDF2, Web Crypto) -------------------------
// Format stored in student_credentials.password_hash:
//   "pbkdf2$<hex-salt>$<hex-derived-key>"
// 100 000 iterations of PBKDF2-SHA-256, 32-byte output.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN = 32;

function hexEncode(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashStudentPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    PBKDF2_KEY_LEN * 8,
  );
  return `pbkdf2$${hexEncode(salt.buffer)}$${hexEncode(derived)}`;
}

export async function verifyStudentPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const saltBytes = new Uint8Array(parts[1].match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const expectedHex = parts[2];
  const key = await crypto.subtle.importKey('raw', encoder.encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: PBKDF2_ITERATIONS },
    key,
    PBKDF2_KEY_LEN * 8,
  );
  return hexEncode(derived) === expectedHex;
}
