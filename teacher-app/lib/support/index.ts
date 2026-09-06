// Support contact helper.
//
// Reads the global support phone from app_settings (key 'support_contact_phone')
// via PostgREST. The table is RLS-locked; only this whitelisted key is readable
// by signed-in clients (see migration 20260603140000_support_phone_public_read).
//
// Falls back to a hardcoded number so the Help screen still works offline or
// before the migration is applied.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

// Last-resort default (matches the seed in app_settings).
export const DEFAULT_SUPPORT_PHONE = '0776465456';

/**
 * Fetch the support contact phone. Returns the default on any failure
 * (offline, missing row, etc.) so the caller always has a usable number.
 */
export async function fetchSupportPhone(token: string): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?key=eq.support_contact_phone&select=value&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      },
    );
    if (!res.ok) return DEFAULT_SUPPORT_PHONE;
    const rows = (await res.json()) as Array<{ value?: string }>;
    const value = rows?.[0]?.value?.trim();
    return value || DEFAULT_SUPPORT_PHONE;
  } catch {
    return DEFAULT_SUPPORT_PHONE;
  }
}

/**
 * Normalise a Sri Lankan local number to international (+94...) form for
 * WhatsApp / tel: links. Leaves already-international numbers untouched.
 */
export function toIntlPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return `+94${digits.slice(1)}`;
  if (digits.startsWith('94')) return `+${digits}`;
  return digits;
}
