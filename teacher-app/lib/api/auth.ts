import { FUNCTIONS_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants';
import { fetchWithRetry } from './retry';

/** Refresh an expired (or near-expiry) Supabase session using the refresh token. */
export async function refreshSession(refreshToken: string): Promise<SupabaseSession> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new ApiError('session_expired', 'Session expired. Please log in again.');
  }
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    token_type: string;
    user: { id: string; email: string };
  };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    token_type: data.token_type,
    user: data.user,
  };
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: { id: string; email: string };
}

export interface TeacherProfile {
  id: string;
  username: string;
}

export interface AuthResult {
  session: SupabaseSession;
  teacher: TeacherProfile;
}

interface EdgeError {
  code: string;
  message: string;
}

async function callFunction<T = AuthResult>(
  name: string,
  body: Record<string, unknown>,
  // Only set retry for endpoints that are SAFE TO REPEAT — never for OTP/SMS or
  // anything with a side effect, since a retried POST can double-fire it.
  opts: { retry?: boolean } = {},
): Promise<T> {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL is not configured. Check your .env.local file.');
  }

  const url = `${FUNCTIONS_URL}/${name}`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    },
    { retries: opts.retry ? 1 : 0 },
  );

  let json: T | { error: EdgeError };
  try {
    json = (await res.json()) as T | { error: EdgeError };
  } catch {
    throw new ApiError(
      'parse_error',
      `Server returned a non-JSON response (HTTP ${res.status}). The edge function may not be deployed.`,
    );
  }

  if (!res.ok || (json && typeof json === 'object' && 'error' in json)) {
    const err = (json as { error: EdgeError }).error;
    throw new ApiError(err?.code ?? 'internal', err?.message ?? 'Unexpected error');
  }

  return json as T;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function activateTeacher(input: {
  username: string;
  password: string;
  token: string;
  device_id: string;
  device_info?: Record<string, string>;
}): Promise<AuthResult> {
  return callFunction('activate_teacher', input);
}

/** Info about the phone that currently holds the device binding. */
export interface BoundDeviceInfo {
  device_id: string;
  device_info?: Record<string, string> | null;
  last_seen_at?: string | null;
}

/** Returned when the account is bound to a different phone and needs confirmation. */
export interface DeviceSwitchRequired {
  requires_device_switch: true;
  current_device: BoundDeviceInfo;
}

export type LoginResult = AuthResult | DeviceSwitchRequired;

export function isDeviceSwitchRequired(r: LoginResult): r is DeviceSwitchRequired {
  return (r as DeviceSwitchRequired).requires_device_switch === true;
}

export async function loginTeacher(input: {
  username: string;
  password: string;
  device_id: string;
  device_info?: Record<string, string>;
  /** Set true to re-bind this device and log the previous phone out. */
  confirm_switch?: boolean;
}): Promise<LoginResult> {
  // Login is side-effect-free (it just authenticates), so a single retry on a
  // transient network blip is safe and saves the teacher a manual re-tap.
  return callFunction<LoginResult>('login_teacher', input, { retry: true });
}

// --- Teacher self-registration (public, phone-OTP verified) -----------------

/** Step 1: send a phone OTP after checking username/phone availability. */
export async function registerTeacherRequest(input: {
  name?: string;
  username: string;
  phone: string;
  email?: string;
}): Promise<{ ok: true }> {
  return callFunction<{ ok: true }>('register_teacher_request', input);
}

/** Step 2: verify the OTP and create + auto-activate the account on this device. */
export async function registerTeacherConfirm(input: {
  name?: string;
  username: string;
  phone: string;
  email?: string;
  password: string;
  otp: string;
  device_id: string;
  device_info?: Record<string, string>;
  /** Package the teacher picked for the free trial (defaults to 'growth'). */
  plan_code?: string;
}): Promise<AuthResult> {
  return callFunction<AuthResult>('register_teacher_confirm', input);
}

// --- Forgot password (public, phone-OTP verified) ---------------------------

/** Step 1: send a reset OTP to the registered phone of the given username. */
export async function requestTeacherPasswordResetOtp(input: {
  username: string;
}): Promise<{ ok: true }> {
  return callFunction<{ ok: true }>('request_teacher_password_reset_otp', input);
}

/** Step 2: check the OTP is valid (without using it up) before asking for a password. */
export async function verifyTeacherPasswordResetOtp(input: {
  username: string;
  otp: string;
}): Promise<{ ok: true }> {
  return callFunction<{ ok: true }>('verify_teacher_password_reset_otp', input);
}

/** Step 3: verify the OTP and set a new password. */
export async function confirmTeacherPasswordReset(input: {
  username: string;
  otp: string;
  new_password: string;
}): Promise<{ ok: true }> {
  return callFunction<{ ok: true }>('confirm_teacher_password_reset', input);
}

export async function changePassword(
  input: { current_password: string; new_password: string; confirm_password: string },
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${FUNCTIONS_URL}/change_password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { ok?: boolean; error?: EdgeError };
  if (!res.ok || !json.ok) {
    const e = (json as { error: EdgeError }).error;
    throw new ApiError(e?.code ?? 'internal', e?.message ?? 'Failed to change password');
  }
}
