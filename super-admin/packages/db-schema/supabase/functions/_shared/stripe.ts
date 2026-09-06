// Shared Stripe client that respects the admin-controlled test/live switch.
// The super admin manages everything from the Settings page:
//   app_settings.stripe_mode                 'test' | 'live'
//   app_settings.stripe_secret_key_test      sk_test_…
//   app_settings.stripe_secret_key_live      sk_live_…
//   app_settings.stripe_webhook_secret_test  whsec_…
//   app_settings.stripe_webhook_secret_live  whsec_…
// Env vars (STRIPE_SECRET_KEY[_TEST|_LIVE], STRIPE_WEBHOOK_SECRET[_TEST|_LIVE])
// are the fallback when a setting is empty, so existing deployments keep
// working. Defaults to 'test' so a fresh install can never charge real cards.

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { adminClient } from './supabase.ts';

export type StripeMode = 'test' | 'live';

export interface StripeConfig {
  mode: StripeMode;
  secretKey: string;
  webhookSecret: string;
}

const KEYS = [
  'stripe_mode',
  'stripe_secret_key_test',
  'stripe_secret_key_live',
  'stripe_webhook_secret_test',
  'stripe_webhook_secret_live',
];

export async function getStripeConfig(): Promise<StripeConfig> {
  const settings = new Map<string, string>();
  try {
    const admin = adminClient();
    const { data } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', KEYS);
    for (const row of data ?? []) settings.set(row.key, row.value);
  } catch {
    // fall through to env-only config
  }

  const mode: StripeMode = settings.get('stripe_mode') === 'live' ? 'live' : 'test';
  const suffix = mode === 'live' ? 'live' : 'test';
  const envSuffix = mode === 'live' ? 'LIVE' : 'TEST';

  const secretKey =
    settings.get(`stripe_secret_key_${suffix}`) ||
    Deno.env.get(`STRIPE_SECRET_KEY_${envSuffix}`) ||
    Deno.env.get('STRIPE_SECRET_KEY') ||
    '';

  const webhookSecret =
    settings.get(`stripe_webhook_secret_${suffix}`) ||
    Deno.env.get(`STRIPE_WEBHOOK_SECRET_${envSuffix}`) ||
    Deno.env.get('STRIPE_WEBHOOK_SECRET') ||
    '';

  return { mode, secretKey, webhookSecret };
}

/** Build a Stripe client for the currently configured mode. */
export async function getStripe(): Promise<{ stripe: Stripe; mode: StripeMode; webhookSecret: string }> {
  const cfg = await getStripeConfig();
  const stripe = new Stripe(cfg.secretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  return { stripe, mode: cfg.mode, webhookSecret: cfg.webhookSecret };
}

export { Stripe };
