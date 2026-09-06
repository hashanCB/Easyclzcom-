// Reads SMS sender settings from app_settings and returns the effective sender ID.
// Demo mode  → always 'TextLKDemo' (text.lk demo sender, works without registration).
// Live mode  → uses the admin-configured sms_sender_name (must be registered).

type AdminClient = ReturnType<typeof import('./supabase.ts').adminClient>;

export const DEMO_SENDER_ID = 'TextLKDemo';

export async function getSmsSender(admin: AdminClient): Promise<string> {
  const { data: rows } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['sms_sender_name', 'sms_demo_mode']);

  const map: Record<string, string> = {};
  for (const r of rows ?? []) map[r.key] = r.value;

  // Default: demo mode on (safe to ship without registration).
  const isDemo = map['sms_demo_mode'] !== 'false';
  if (isDemo) return DEMO_SENDER_ID;

  return map['sms_sender_name'] ?? Deno.env.get('TEXTLK_SENDER_ID') ?? DEMO_SENDER_ID;
}
