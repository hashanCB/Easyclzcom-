'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UpdateSettingResult } from './settings';

// ─── APK download URL (easyclz.com hero "Google Play" button) ────────────────

export async function getApkDownloadUrl(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'apk_download_url')
    .maybeSingle();
  return data?.value ?? '';
}

export async function updateApkDownloadUrlAction(
  _prev: UpdateSettingResult,
  formData: FormData,
): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const raw = (formData.get('apk_download_url') as string | null)?.trim() ?? '';
  // Empty is allowed — clears the link and hides the button on the website.
  if (raw && !/^https?:\/\/.+/i.test(raw)) {
    return { error: 'Enter a valid URL starting with http:// or https://' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'apk_download_url', value: raw, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) return { error: 'Failed to save: ' + error.message };

  revalidatePath('/website');
  return { ok: true };
}
