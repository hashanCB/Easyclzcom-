// Reads public settings that the super-admin panel controls (shared Supabase).
// Only the whitelisted `apk_download_url` key is readable by the anon role —
// see migration 20260616120000_apk_download_url.sql in the super-admin repo.
//
// The anon/publishable key is safe to ship in the client bundle by design.
// Falls back to the production project if env vars are not set.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kesssbvejyeefyaqjobk.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_-bG3TTxPtduZjdh2axQqQQ_J9163VD6';

export async function fetchApkDownloadUrl(): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?key=eq.apk_download_url&select=value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) return '';
    const rows = (await res.json()) as Array<{ value?: string }>;
    return rows?.[0]?.value?.trim() ?? '';
  } catch {
    return '';
  }
}
