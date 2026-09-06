// Device session fence (newest-device-wins / auto-evict).
//
// When a teacher signs in on a new phone, login_teacher re-binds the account to
// that phone and sets THIS phone's teacher_sessions row to is_active = false.
// This phone keeps a still-valid Supabase JWT until it expires, so it would
// otherwise stay logged in. The fence is a cheap REST check (RLS:
// teacher_sessions_self_select, auth.uid() = teacher_id) that this phone runs on
// foreground / on an interval: if its own session row is gone or inactive, the
// account has been moved to another device and this phone logs itself out.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const REST = `${SUPABASE_URL}/rest/v1`;

/**
 * Returns true if THIS device's session is still the active one for the teacher.
 * On any network/parse error returns true (fail-open) — we never want a blip to
 * log a working teacher out; only a definitive "inactive" eviction does that.
 */
export async function isDeviceSessionActive(
  teacherId: string,
  deviceId: string,
  token: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      teacher_id: `eq.${teacherId}`,
      device_id: `eq.${deviceId}`,
      select: 'is_active',
      limit: '1',
    });
    const res = await fetch(`${REST}/teacher_sessions?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return true; // fail-open on transient errors
    const rows = (await res.json()) as { is_active: boolean }[];
    // A row that exists and is explicitly inactive = superseded by another phone.
    // No row yet (older session created before this feature) = treat as active.
    if (rows.length === 0) return true;
    return rows[0].is_active !== false;
  } catch {
    return true; // fail-open
  }
}
