'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface UpdateSettingResult {
  error?: string;
  ok?: boolean;
}

// ─── SMS demo mode ────────────────────────────────────────────────────────────

export async function getSmsMode(): Promise<'demo' | 'live'> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'sms_demo_mode')
    .maybeSingle();
  return data?.value === 'false' ? 'live' : 'demo';
}

export async function updateSmsModeAction(mode: 'demo' | 'live'): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'sms_demo_mode', value: mode === 'demo' ? 'true' : 'false', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

// ─── SMS sender name ──────────────────────────────────────────────────────────

export async function getSmsSenderName(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'sms_sender_name')
    .maybeSingle();
  return data?.value ?? 'TextLKDemo';
}

export async function updateSmsSenderNameAction(
  _prev: UpdateSettingResult,
  formData: FormData,
): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const raw = (formData.get('sms_sender_name') as string | null)?.trim() ?? '';
  if (!raw) return { error: 'Sender name is required.' };
  if (raw.length > 11) return { error: 'Sender name must be 11 characters or fewer (SMS standard).' };
  if (!/^[A-Za-z0-9\- ]+$/.test(raw)) return { error: 'Only letters, numbers, spaces and hyphens allowed.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'sms_sender_name', value: raw, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) return { error: 'Failed to save: ' + error.message };

  revalidatePath('/settings');
  return { ok: true };
}

export async function getSupportContactPhone(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'support_contact_phone')
    .maybeSingle();
  return data?.value ?? '';
}

export async function updateSupportContactPhoneAction(
  _prev: UpdateSettingResult,
  formData: FormData,
): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const raw = (formData.get('support_contact_phone') as string | null)?.trim() ?? '';
  if (!raw) return { error: 'Phone number is required.' };
  if (!/^[0-9+\-\s()]{7,20}$/.test(raw)) return { error: 'Enter a valid phone number.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'support_contact_phone', value: raw, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) return { error: 'Failed to save: ' + error.message };

  revalidatePath('/settings');
  return { ok: true };
}

// ─── Trial length (days) ────────────────────────────────────────────────────

const DEFAULT_TRIAL_DAYS = 14;

export async function getTrialDays(): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'trial_days')
    .maybeSingle();
  const n = parseInt(data?.value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TRIAL_DAYS;
}

export async function updateTrialDaysAction(
  _prev: UpdateSettingResult,
  formData: FormData,
): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const raw = (formData.get('trial_days') as string | null)?.trim() ?? '';
  const n = parseInt(raw, 10);
  if (!raw || !Number.isFinite(n)) return { error: 'Enter a number of days.' };
  if (n < 1 || n > 365) return { error: 'Trial length must be between 1 and 365 days.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'trial_days', value: String(n), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) return { error: 'Failed to save: ' + error.message };

  revalidatePath('/settings');
  return { ok: true };
}

// ─── Subscription plans (packages) ───────────────────────────────────────────

export interface SubscriptionPlan {
  code: string;
  name: string;
  blurb: string;
  max_students: number | null;
  price_cents: number;
  currency: string;
  sort_order: number;
  is_active: boolean;
}

/** All plans, including inactive legacy codes (shown greyed-out). */
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('subscription_plans')
    .select('code, name, blurb, max_students, price_cents, currency, sort_order, is_active')
    .order('sort_order', { ascending: true });
  return (data as SubscriptionPlan[] | null) ?? [];
}

/**
 * Update one plan's monthly price (entered in dollars). Applies to all NEW
 * checkouts immediately; teachers already paying keep their existing price.
 */
export async function updatePlanPriceAction(
  _prev: UpdateSettingResult,
  formData: FormData,
): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const code = (formData.get('code') as string | null)?.trim() ?? '';
  const raw = (formData.get('price') as string | null)?.trim() ?? '';
  if (!code) return { error: 'Missing plan code.' };

  const price = Number(raw);
  if (!raw || !Number.isFinite(price) || price < 0) return { error: 'Enter a valid price.' };
  if (price > 10000) return { error: 'Price seems too high.' };
  const priceCents = Math.round(price * 100);

  const admin = createAdminClient();
  const { error, data } = await admin
    .from('subscription_plans')
    .update({ price_cents: priceCents })
    .eq('code', code)
    .select('code')
    .maybeSingle();

  if (error) return { error: 'Failed to save: ' + error.message };
  if (!data) return { error: 'Plan not found.' };

  revalidatePath('/settings');
  return { ok: true };
}

export async function getStudentWebUrl(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'student_web_url')
    .maybeSingle();
  return data?.value ?? '';
}

export async function updateStudentWebUrlAction(
  _prev: UpdateSettingResult,
  formData: FormData,
): Promise<UpdateSettingResult> {
  // Only an authenticated super-admin may reach this page, but re-check here.
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const raw = (formData.get('student_web_url') as string | null)?.trim() ?? '';
  if (!raw) return { error: 'URL is required.' };

  // Basic shape check — must be http(s) and a valid URL.
  let normalized: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { error: 'URL must start with http:// or https://' };
    }
    normalized = u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''));
  } catch {
    return { error: 'Enter a valid URL, e.g. http://localhost:3100' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'student_web_url', value: normalized, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) return { error: 'Failed to save: ' + error.message };

  revalidatePath('/settings');
  return { ok: true };
}

// ─── Stripe test/live mode ────────────────────────────────────────────────────

export async function getStripeMode(): Promise<'test' | 'live'> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'stripe_mode')
    .maybeSingle();
  return data?.value === 'live' ? 'live' : 'test';
}

export async function updateStripeModeAction(mode: 'test' | 'live'): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const admin = createAdminClient();

  // Live mode needs the live keys saved first — otherwise every teacher's
  // checkout would silently fail.
  if (mode === 'live') {
    const { data } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ['stripe_secret_key_live', 'stripe_webhook_secret_live']);
    const map = new Map((data ?? []).map((r) => [r.key, r.value as string]));
    if (!map.get('stripe_secret_key_live')) {
      return { error: 'Enter the Live secret key (sk_live_…) below before switching to Live.' };
    }
    if (!map.get('stripe_webhook_secret_live')) {
      return { error: 'Enter the Live webhook secret (whsec_…) below before switching to Live.' };
    }
  }

  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: 'stripe_mode', value: mode, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

// ─── Stripe API keys (entered by the admin, stored in app_settings) ──────────

const STRIPE_KEY_FIELDS = {
  stripe_secret_key_test: { prefix: 'sk_test_', label: 'Test secret key' },
  stripe_secret_key_live: { prefix: 'sk_live_', label: 'Live secret key' },
  stripe_webhook_secret_test: { prefix: 'whsec_', label: 'Test webhook secret' },
  stripe_webhook_secret_live: { prefix: 'whsec_', label: 'Live webhook secret' },
} as const;

export type StripeKeyField = keyof typeof STRIPE_KEY_FIELDS;

export type StripeKeySource = 'settings' | 'supabase_secret' | 'missing';

export interface StripeKeyStatus {
  field: StripeKeyField;
  set: boolean;
  hint: string; // '…1234' when set, '' otherwise
  source: StripeKeySource;
}

// Maps stripe_config_status response keys to our field names.
const STATUS_FIELD_MAP: Record<string, StripeKeyField> = {
  test_secret: 'stripe_secret_key_test',
  test_webhook: 'stripe_webhook_secret_test',
  live_secret: 'stripe_secret_key_live',
  live_webhook: 'stripe_webhook_secret_live',
};

export async function getStripeKeysStatus(): Promise<StripeKeyStatus[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', Object.keys(STRIPE_KEY_FIELDS));
  const map = new Map((data ?? []).map((r) => [r.key, r.value as string]));

  // Ask the edge runtime whether Supabase-secret fallbacks exist (the Next
  // server can't see function env vars). Best-effort — on failure we only
  // know about settings-stored keys.
  const sources = new Map<StripeKeyField, StripeKeySource>();
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe_config_status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
          cache: 'no-store',
        },
      );
      if (res.ok) {
        const body = (await res.json()) as { keys?: Record<string, StripeKeySource> };
        for (const [k, field] of Object.entries(STATUS_FIELD_MAP)) {
          const s = body.keys?.[k];
          if (s) sources.set(field, s);
        }
      }
    }
  } catch {
    // ignore — fall back to settings-only view
  }

  return (Object.keys(STRIPE_KEY_FIELDS) as StripeKeyField[]).map((field) => {
    const v = map.get(field) ?? '';
    const source: StripeKeySource =
      v.length > 0 ? 'settings' : sources.get(field) ?? 'missing';
    return { field, set: v.length > 0, hint: v.length > 4 ? `…${v.slice(-4)}` : '', source };
  });
}

export async function updateStripeKeyAction(
  field: StripeKeyField,
  value: string,
): Promise<UpdateSettingResult> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };

  const spec = STRIPE_KEY_FIELDS[field];
  if (!spec) return { error: 'Unknown key' };
  const trimmed = value.trim();
  if (trimmed && !trimmed.startsWith(spec.prefix)) {
    return { error: `${spec.label} must start with ${spec.prefix}` };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('app_settings')
    .upsert(
      { key: field, value: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}
