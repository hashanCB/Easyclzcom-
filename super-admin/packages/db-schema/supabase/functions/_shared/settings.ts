// Reads global key/value settings from the app_settings table, with env +
// hardcoded fallbacks so links still resolve if the row is missing.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export async function getStudentWebUrl(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'student_web_url')
    .maybeSingle();

  const fromDb = data?.value?.trim();
  const url = fromDb || Deno.env.get('STUDENT_WEB_URL') || 'https://classpay.app';
  return url.replace(/\/+$/, ''); // strip trailing slash
}
