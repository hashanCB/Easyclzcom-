function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto not available. On React Native install react-native-quick-crypto polyfill.');
  }
  return c;
}

export function randomUuid(): string {
  const c = getCrypto();
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now: number = Date.now()): string {
  const c = getCrypto();
  let timeChars = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    timeChars = ULID_ALPHABET[t % 32] + timeChars;
    t = Math.floor(t / 32);
  }
  const rnd = new Uint8Array(16);
  c.getRandomValues(rnd);
  let randChars = '';
  for (let i = 0; i < 16; i++) {
    randChars += ULID_ALPHABET[rnd[i]! % 32];
  }
  return timeChars + randChars;
}

function unbiasedRandomDigit(): string {
  const c = getCrypto();
  const buf = new Uint8Array(1);
  while (true) {
    c.getRandomValues(buf);
    if (buf[0]! < 250) return String(buf[0]! % 10);
  }
}

export function generateNumericPassword(digits: number): string {
  if (!Number.isInteger(digits) || digits < 1 || digits > 32) {
    throw new Error('generateNumericPassword: digits must be 1..32');
  }
  let out = '';
  for (let i = 0; i < digits; i++) out += unbiasedRandomDigit();
  return out;
}

export function generateStudentPassword(): string {
  return generateNumericPassword(6);
}

export function generateAssistantPassword(): string {
  return generateNumericPassword(8);
}

export function generateActivationToken(): string {
  return generateNumericPassword(12);
}

const STUDENT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface StudentCodeOptions {
  prefix?: string;
  segmentLength?: number;
}

export function generateStudentCode(opts: StudentCodeOptions = {}): string {
  const { prefix = 'S', segmentLength = 6 } = opts;
  if (segmentLength < 4 || segmentLength > 12) {
    throw new Error('generateStudentCode: segmentLength must be 4..12');
  }
  const c = getCrypto();
  const buf = new Uint8Array(segmentLength);
  c.getRandomValues(buf);
  let code = '';
  for (let i = 0; i < segmentLength; i++) {
    code += STUDENT_CODE_ALPHABET[buf[i]! % STUDENT_CODE_ALPHABET.length];
  }
  return `${prefix}-${code}`;
}

export function generateIdempotencyKey(): string {
  return ulid();
}
