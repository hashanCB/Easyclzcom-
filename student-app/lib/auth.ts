// Student portal auth — global account login (phone + password, multi-class).
// Session is persisted in localStorage.

import { useEffect, useState } from 'react';

const GLOBAL_STORAGE_KEY = 'classpay_student_global_session';
const SUPABASE_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').replace(/\s/g, '');
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/\s/g, '');

// ─── Global account session (multi-class) ─────────────────────────────────

export interface Enrollment {
  student_id: string;
  teacher_id: string;
  teacher_username: string;
  student_code: string;
  name: string;
  grade: string;
  subject: string;
  card_version: number;
  portal_active?: boolean; // false = portal access suspended by teacher/admin
  // 'pending_payment' = joined but awaiting first payment (not yet registered);
  // 'confirmed' = fully enrolled. Absent on older sessions → treat as confirmed.
  join_status?: string;
  token: string; // per-enrollment JWT — works with all existing edge functions
}

export interface GlobalStudentSession {
  account: { id: string; name: string; phone: string; avatar_emoji?: string; avatar_color?: string; profile_photo?: string | null };
  enrollments: Enrollment[];
  selectedIndex: number;
}

// ─── Session storage ───────────────────────────────────────────────────────

export function getGlobalSession(): GlobalStudentSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GLOBAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GlobalStudentSession) : null;
  } catch { return null; }
}

export function saveGlobalSession(session: GlobalStudentSession): void {
  localStorage.setItem(GLOBAL_STORAGE_KEY, JSON.stringify(session));
}

export function setActiveEnrollment(index: number): void {
  const s = getGlobalSession();
  if (!s) return;
  saveGlobalSession({ ...s, selectedIndex: index });
  window.location.reload();
}

export function clearSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(GLOBAL_STORAGE_KEY);
  }
}

export function isLoggedIn(): boolean {
  return getGlobalSession() !== null;
}

// Returns the active enrollment as a minimal token shape for edge function calls.
export function getActiveToken(): string | null {
  const s = getGlobalSession();
  if (!s) return null;
  const e = s.enrollments[s.selectedIndex] ?? s.enrollments[0];
  return e?.token ?? null;
}

// ─── Auth actions ──────────────────────────────────────────────────────────

async function post(path: string, body: unknown) {
  return fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return {}; }
}

export async function loginStudentGlobal(phone: string, password: string): Promise<GlobalStudentSession> {
  const res  = await post('student_global_login', { phone, password });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code as string ?? 'internal', data?.error?.message as string ?? 'Login failed');
  const session: GlobalStudentSession = {
    account: data.account as GlobalStudentSession['account'],
    enrollments: data.enrollments as Enrollment[],
    selectedIndex: 0,
  };
  saveGlobalSession(session);
  return session;
}

export async function registerStudent(phone: string, name: string, password: string): Promise<void> {
  const res  = await post('student_register', { phone, name, password });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code as string ?? 'internal', data?.error?.message as string ?? 'Registration failed');
}

// Step 1: send a phone-verification OTP for a new registration. Returns the
// debug OTP when the server is in SMS demo mode (so testers can read it back).
export async function requestStudentRegisterOtp(
  phone: string, name: string, password: string,
): Promise<{ debugOtp?: string }> {
  const res  = await post('student_register_request', { phone, name, password });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new ApiError(
      data?.error?.code as string ?? 'internal',
      data?.error?.message as string ?? 'Could not send verification code',
    );
  }
  return { debugOtp: data?.debug_otp as string | undefined };
}

// Step 2: confirm the OTP and create the account.
export async function confirmStudentRegisterOtp(phone: string, otp: string): Promise<void> {
  const res  = await post('student_register_confirm', { phone, otp });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new ApiError(
      data?.error?.code as string ?? 'internal',
      data?.error?.message as string ?? 'Verification failed',
    );
  }
}

export async function changeStudentPassword(currentPassword: string, newPassword: string): Promise<void> {
  const session = getGlobalSession();
  if (!session) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('change_student_password', {
    account_id:       session.account.id,
    phone:            session.account.phone,
    current_password: currentPassword,
    new_password:     newPassword,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to change password', data?.error?.details);
}

export async function updateStudentName(password: string, name: string): Promise<void> {
  const session = getGlobalSession();
  if (!session) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('update_student_name', {
    account_id: session.account.id,
    phone: session.account.phone,
    password,
    name,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to update name');
  // Update local session.
  saveGlobalSession({ ...session, account: { ...session.account, name } });
}

export async function updateStudentAvatar(emoji: string, color: string): Promise<void> {
  const session = getGlobalSession();
  if (!session) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('update_student_avatar', {
    account_id: session.account.id,
    phone: session.account.phone,
    emoji,
    color,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to update avatar');
  // Update local session.
  saveGlobalSession({ ...session, account: { ...session.account, avatar_emoji: emoji, avatar_color: color } });
}

/**
 * Set or clear the student's real profile photo. `dataUrl` is a downscaled image
 * data URL (data:image/...;base64,…) or null to remove it. The photo is copied
 * to each teacher's record when the student joins (or has joined) a class.
 */
export async function updateStudentPhoto(dataUrl: string | null): Promise<void> {
  const session = getGlobalSession();
  if (!session) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('update_student_photo', {
    account_id: session.account.id,
    phone: session.account.phone,
    profile_photo: dataUrl,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to update photo');
  saveGlobalSession({ ...session, account: { ...session.account, profile_photo: dataUrl } });
}

export async function requestPhoneChange(password: string, newPhone: string): Promise<void> {
  const session = getGlobalSession();
  if (!session) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('request_phone_change', {
    account_id: session.account.id,
    phone: session.account.phone,
    password,
    new_phone: newPhone,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to send OTP', data?.error?.details);
}

export async function confirmPhoneChange(newPhone: string, otp: string): Promise<void> {
  const session = getGlobalSession();
  if (!session) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('confirm_phone_change', {
    account_id: session.account.id,
    phone: session.account.phone,
    new_phone: newPhone,
    otp,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to confirm phone change');
  // Update local session with new phone.
  saveGlobalSession({ ...session, account: { ...session.account, phone: newPhone } });
}

export async function requestPasswordResetOtp(phone: string): Promise<{ dev_otp?: string }> {
  const res  = await post('request_password_reset_otp', { phone });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to send code');
  // In dev the backend returns the OTP on screen (SMS provider may be down).
  return { dev_otp: data?.dev_otp as string | undefined };
}

export async function confirmPasswordReset(phone: string, otp: string, newPassword: string): Promise<void> {
  const res  = await post('confirm_password_reset', { phone, otp, new_password: newPassword });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to reset password');
}


/** Compares two enrollment lists by meaningful state (ignores rotating tokens). */
function enrollmentsDiffer(a: Enrollment[], b: Enrollment[]): boolean {
  if (a.length !== b.length) return true;
  const key = (e: Enrollment) => `${e.student_id}:${e.portal_active !== false}:${e.join_status ?? 'confirmed'}`;
  const setA = new Set(a.map(key));
  return b.some((e) => !setA.has(key(e)));
}

/**
 * Re-fetches enrollment status from the server and updates the cached session,
 * so suspend/restore/unlink changes made by a teacher or admin show up without
 * a fresh login. Returns true if anything meaningful changed (caller may reload).
 * If the account was deactivated/deleted, clears the session and redirects to login.
 */
export async function refreshGlobalSession(): Promise<boolean> {
  const s = getGlobalSession();
  if (!s) return false;

  let res: Response;
  try {
    res = await post('student_refresh_session', { account_id: s.account.id, phone: s.account.phone });
  } catch {
    return false; // network blip — keep the cached session as-is
  }

  const data = await safeJson(res);
  if (!res.ok) {
    const code = data?.error?.code as string | undefined;
    if (code === 'account_locked' || code === 'wrong_credentials') {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return false;
  }

  const fresh = (data.enrollments ?? []) as Enrollment[];
  const changed = enrollmentsDiffer(s.enrollments, fresh);
  const selectedIndex = Math.min(s.selectedIndex, Math.max(0, fresh.length - 1));
  saveGlobalSession({
    account: { ...s.account, ...(data.account ?? {}) },
    enrollments: fresh,
    selectedIndex,
  });
  return changed;
}

/**
 * Marks one enrollment as portal-suspended in the cached session.
 * Called when a data fetch returns `access_suspended` so the UI catches up
 * with a suspension that happened after login (cached session was stale).
 * Returns true if the cache changed.
 */
export function markEnrollmentSuspended(student_id: string): boolean {
  const s = getGlobalSession();
  if (!s) return false;
  let changed = false;
  const updated = s.enrollments.map((e) => {
    if (e.student_id === student_id && e.portal_active !== false) {
      changed = true;
      return { ...e, portal_active: false };
    }
    return e;
  });
  if (changed) saveGlobalSession({ ...s, enrollments: updated });
  return changed;
}

/** Removes one enrollment from the local session (call after a successful unlink_class). */
export function removeEnrollmentFromSession(student_id: string): void {
  const s = getGlobalSession();
  if (!s) return;
  const updated = s.enrollments.filter((e) => e.student_id !== student_id);
  // Reset selectedIndex if it pointed past the end.
  const newIndex = Math.min(s.selectedIndex, Math.max(0, updated.length - 1));
  saveGlobalSession({ ...s, enrollments: updated, selectedIndex: newIndex });
}

// ─── Join by class code (request → teacher approval) ───────────────────────

export interface ClassCodeInfo {
  class_id: string;
  teacher_username: string | null;
  teacher_name: string | null;
  teacher_qualifications: string[];
  subject: string;
  grade: string;
  batch: string;
  class_type: string;
  language: string;
  monthly_fee_cents: number;
}

/** Look up class details from a join code (public — works before login too). */
export async function getClassByCode(code: string): Promise<ClassCodeInfo> {
  const res  = await post('get_class_by_code', { code });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Class not found');
  // Default qualifications to [] for older servers that don't return the field.
  return { ...data, teacher_qualifications: Array.isArray(data?.teacher_qualifications) ? data.teacher_qualifications : [] } as ClassCodeInfo;
}

/** Send a join request for the class with this code. Teacher must accept it. */
export async function requestJoinClass(code: string): Promise<void> {
  const s = getGlobalSession();
  if (!s) throw new ApiError('unauthenticated', 'Not signed in');
  const res  = await post('request_join_class', {
    code,
    account_id: s.account.id,
    phone: s.account.phone,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to send request');
}

export interface JoinRequest {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  decided_at: string | null;
  class: { subject: string; grade: string; batch: string } | null;
  teacher: { username: string; name: string | null } | null;
}

/** This account's join requests (newest first) — for showing pending status. */
export async function myJoinRequests(): Promise<JoinRequest[]> {
  const s = getGlobalSession();
  if (!s) return [];
  const res  = await post('my_join_requests', { account_id: s.account.id, phone: s.account.phone });
  const data = await safeJson(res);
  if (!res.ok) return [];
  return (data.requests ?? []) as JoinRequest[];
}

/** Student removes themselves from a class. */
export async function unlinkClass(studentId: string): Promise<void> {
  const s = getGlobalSession();
  if (!s) throw new ApiError('unauthorized', 'Not signed in.');
  const res  = await post('unlink_class', {
    account_id: s.account.id,
    phone:      s.account.phone,
    student_id: studentId,
  });
  const data = await safeJson(res);
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'internal', data?.error?.message ?? 'Failed to leave class');
  removeEnrollmentFromSession(studentId);
}

// ─── React hooks ──────────────────────────────────────────────────────────

export function useGlobalSession(): GlobalStudentSession | null {
  const [session, setSession] = useState<GlobalStudentSession | null>(null);
  useEffect(() => { setSession(getGlobalSession()); }, []);
  return session;
}

export function useEnrollments(): Enrollment[] {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  useEffect(() => {
    const s = getGlobalSession();
    setEnrollments(s?.enrollments ?? []);
  }, []);
  return enrollments;
}

export function useAccountName(): string {
  const [name, setName] = useState('');
  useEffect(() => {
    const s = getGlobalSession();
    if (s) setName(s.account.name);
  }, []);
  return name;
}

// ─── Error class ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
