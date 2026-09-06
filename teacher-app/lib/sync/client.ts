import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired. Please log in again.');
    this.name = 'SessionExpiredError';
  }
}

const REST = `${SUPABASE_URL}/rest/v1`;

function headers(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
    ...extra,
  };
}

/** Upsert rows to a Supabase table using primary-key conflict resolution. */
export async function supabaseUpsert(
  table: string,
  rows: Record<string, unknown>[],
  token: string,
): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: headers(token, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    const body = await res.text().catch(() => res.status.toString());
    throw new Error(`supabaseUpsert(${table}): ${res.status} ${body}`);
  }
}

/** Read every student's (id, student_code) for a teacher — used to detect and
 *  resolve duplicate-code conflicts before re-pushing. */
export async function supabaseStudentCodes(
  teacherId: string,
  token: string,
): Promise<{ id: string; student_code: string }[]> {
  const params = new URLSearchParams({
    teacher_id: `eq.${teacherId}`,
    select: 'id,student_code',
    limit: '10000',
  });
  const res = await fetch(`${REST}/students?${params}`, {
    headers: headers(token, { Accept: 'application/json' }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    const body = await res.text().catch(() => res.status.toString());
    throw new Error(`supabaseStudentCodes: ${res.status} ${body}`);
  }
  return res.json() as Promise<{ id: string; student_code: string }[]>;
}

/** Live students in a class with this exact student_phone — used to detect
 *  which local row collides with the cloud's students_class_phone_uniq index. */
export async function supabaseStudentsByClassPhone(
  classId: string,
  phone: string,
  token: string,
): Promise<{ id: string }[]> {
  const params = new URLSearchParams({
    class_id: `eq.${classId}`,
    student_phone: `eq.${phone}`,
    deleted_at: 'is.null',
    select: 'id',
    limit: '20',
  });
  const res = await fetch(`${REST}/students?${params}`, {
    headers: headers(token, { Accept: 'application/json' }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    const body = await res.text().catch(() => res.status.toString());
    throw new Error(`supabaseStudentsByClassPhone: ${res.status} ${body}`);
  }
  return res.json() as Promise<{ id: string }[]>;
}

/** Pull rows from a Supabase table updated after `cursor` for a given teacher. */
export async function supabasePull(
  table: string,
  teacherId: string,
  cursor: string,
  token: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    teacher_id: `eq.${teacherId}`,
    updated_at: `gt.${cursor}`,
    order: 'updated_at.asc',
    limit: '1000',
  });
  const res = await fetch(`${REST}/${table}?${params}`, {
    headers: headers(token, { Accept: 'application/json' }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
    const body = await res.text().catch(() => res.status.toString());
    throw new Error(`supabasePull(${table}): ${res.status} ${body}`);
  }
  return res.json() as Promise<Record<string, unknown>[]>;
}

/** Convert a camelCase JS key to snake_case for the Supabase REST API. */
export function toSnake(s: string): string {
  return s.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`);
}

/** Convert a snake_case API key to camelCase for Drizzle. */
export function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Local-only fields that the cloud schema does not have. */
const LOCAL_ONLY_FIELDS: Record<string, ReadonlySet<string>> = {
  students: new Set(['passwordPlain']),
};

// Map legacy 3-letter day codes to the lowercase full names the cloud check
// constraint requires. Applied at push so old local rows (created before the
// ClassForm fix) can sync without forcing the user to delete and recreate.
const DAY_NORMALIZE: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
};

// Cloud check: language IN ('sinhala','english','tamil','other').
const KNOWN_LANGUAGES = new Set(['sinhala', 'english', 'tamil', 'other']);
// Cloud check: gender IN ('male','female','other','prefer_not_to_say').
const KNOWN_GENDERS = new Set(['male', 'female', 'other', 'prefer_not_to_say']);

function normalizeForCloud(table: string, key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (table === 'classes' && key === 'classDay') {
    // Support comma-separated multi-day values e.g. 'monday,wednesday,friday'
    return value
      .split(',')
      .map((d) => {
        const lower = d.trim().toLowerCase();
        return DAY_NORMALIZE[lower.slice(0, 3)] ?? lower;
      })
      .join(',');
  }
  if ((table === 'classes' || table === 'students' || table === 'exams') && key === 'language') {
    const lower = value.toLowerCase();
    return KNOWN_LANGUAGES.has(lower) ? lower : 'other';
  }
  if (table === 'students' && key === 'gender') {
    const lower = value.toLowerCase().replace(/\s+/g, '_');
    return KNOWN_GENDERS.has(lower) ? lower : null;
  }
  return value;
}

/** Prepare a local Drizzle row for the Supabase REST API.
 *  - Converts keys to snake_case
 *  - Drops `syncedAt` (always local-only)
 *  - Drops per-table local-only fields (e.g. students.passwordPlain)
 *  - Normalizes legacy enum values (e.g. classes.classDay 'Mon' → 'monday') */
export function rowToApi(
  row: Record<string, unknown>,
  table?: string,
): Record<string, unknown> {
  const localOnly = table ? LOCAL_ONLY_FIELDS[table] : undefined;
  return Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => k !== 'syncedAt' && !localOnly?.has(k))
      .map(([k, v]) => [toSnake(k), table ? normalizeForCloud(table, k, v) : v]),
  );
}

/** Convert a Supabase REST API row to a Drizzle-compatible object. */
export function apiToRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [toCamel(k), v]),
  );
}
