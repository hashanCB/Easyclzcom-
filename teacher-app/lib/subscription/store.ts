import { create } from 'zustand';
import * as Linking from 'expo-linking';
import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../constants';

export type SubscriptionStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'incomplete';

export interface Subscription {
  status: SubscriptionStatus;
  plan_code: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  is_pro: boolean;
}

export interface Invoice {
  id: string;
  amount_paid: number;   // cents
  currency: string;
  status: string;
  period_start: number;  // unix timestamp
  period_end: number;
  created: number;
  hosted_invoice_url: string | null;
}

// Don't show the upgrade ad more than once per this window, so it never spams.
const AD_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
let lastAdShownAt = 0;

/** The plans a teacher can choose from on the paywall. */
export interface Plan {
  code: string;
  name: string;
  blurb: string;
  maxStudents: number | null; // null = unlimited
  price: string;              // display only — the real charge comes from Stripe
}

// Built-in fallback, shown until fetchPlans() returns the live list (prices in
// the DB are editable by the super-admin, so the server copy wins).
export const PLANS: Plan[] = [
  { code: 'starter',   name: 'Starter',   blurb: 'Up to 50 students',   maxStudents: 50,   price: '$1' },
  { code: 'basic',     name: 'Basic',     blurb: 'Up to 100 students',  maxStudents: 100,  price: '$3' },
  { code: 'growth',    name: 'Growth',    blurb: 'Most popular',        maxStudents: 500,  price: '$8' },
  { code: 'unlimited', name: 'Unlimited', blurb: 'Unlimited students',  maxStudents: null, price: '$25' },
];

/** The plan new sign-ups trial on when they don't pick one. */
export const DEFAULT_PLAN_CODE = 'growth';

interface ServerPlan {
  code: string;
  name: string;
  blurb: string | null;
  max_students: number | null;
  price_cents: number;
  currency: string;
}

function formatPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return currency.toLowerCase() === 'usd' ? `$${text}` : `${text} ${currency.toUpperCase()}`;
}

interface SubscriptionState {
  subscription: Subscription | null;
  /** Live plan list from the server; starts as the built-in PLANS fallback. */
  plans: Plan[];
  invoices: Invoice[];
  loading: boolean;
  invoicesLoading: boolean;
  cancelling: boolean;
  reactivating: boolean;
  error: string | null;
  /** Whether the "Upgrade to Pro" marketing popup is currently showing. */
  adVisible: boolean;
  /** Whether the post-payment "thank you for subscribing" popup is showing. */
  thankYouVisible: boolean;

  fetch: (accessToken: string) => Promise<void>;
  /** Loads the current packages + prices. Public — no auth token needed. */
  fetchPlans: () => Promise<void>;
  fetchInvoices: (accessToken: string) => Promise<void>;
  cancelSubscription: (accessToken: string) => Promise<void>;
  reactivateSubscription: (accessToken: string) => Promise<void>;
  createCheckoutSession: (accessToken: string, planCode?: string) => Promise<string>;
  /** Show the upgrade ad — but only for Free users, and not within the cooldown. */
  maybeShowAd: () => void;
  hideAd: () => void;
  /** Called when the teacher returns from a successful Stripe checkout. */
  showThankYou: () => void;
  hideThankYou: () => void;
  clear: () => void;
}

function authHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscription: null,
  plans: PLANS,
  invoices: [],
  loading: false,
  invoicesLoading: false,
  cancelling: false,
  reactivating: false,
  error: null,
  adVisible: false,
  thankYouVisible: false,

  fetch: async (accessToken: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${FUNCTIONS_URL}/get_subscription`, {
        method: 'POST',
        headers: authHeaders(accessToken),
      });
      const json = (await res.json()) as { subscription: Subscription | null };
      set({ subscription: json.subscription, loading: false });
    } catch {
      set({ error: 'Failed to load subscription', loading: false });
    }
  },

  fetchPlans: async () => {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/get_plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      });
      const json = (await res.json()) as { plans?: ServerPlan[] };
      if (Array.isArray(json.plans) && json.plans.length > 0) {
        set({
          plans: json.plans.map((p) => ({
            code: p.code,
            name: p.name,
            blurb: p.blurb || (p.max_students == null ? 'Unlimited students' : `Up to ${p.max_students} students`),
            maxStudents: p.max_students,
            price: formatPrice(p.price_cents, p.currency),
          })),
        });
      }
    } catch {
      // Offline / server unreachable — keep the built-in fallback list.
    }
  },

  fetchInvoices: async (accessToken: string) => {
    set({ invoicesLoading: true });
    try {
      const res = await fetch(`${FUNCTIONS_URL}/get_invoices`, {
        method: 'POST',
        headers: authHeaders(accessToken),
      });
      const json = (await res.json()) as { invoices: Invoice[] };
      set({ invoices: json.invoices ?? [], invoicesLoading: false });
    } catch {
      set({ invoicesLoading: false });
    }
  },

  cancelSubscription: async (accessToken: string) => {
    set({ cancelling: true, error: null });
    try {
      const res = await fetch(`${FUNCTIONS_URL}/cancel_subscription`, {
        method: 'POST',
        headers: authHeaders(accessToken),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to cancel subscription');
      }
      // Reflect locally immediately — re-fetch will confirm from server
      set((s) => ({
        cancelling: false,
        subscription: s.subscription
          ? { ...s.subscription, cancel_at_period_end: true }
          : null,
      }));
    } catch (e) {
      set({ cancelling: false, error: e instanceof Error ? e.message : 'Failed to cancel' });
      throw e;
    }
  },

  reactivateSubscription: async (accessToken: string) => {
    set({ reactivating: true, error: null });
    try {
      const res = await fetch(`${FUNCTIONS_URL}/reactivate_subscription`, {
        method: 'POST',
        headers: authHeaders(accessToken),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to reactivate subscription');
      }
      set((s) => ({
        reactivating: false,
        subscription: s.subscription
          ? { ...s.subscription, cancel_at_period_end: false }
          : null,
      }));
    } catch (e) {
      set({ reactivating: false, error: e instanceof Error ? e.message : 'Failed to reactivate' });
      throw e;
    }
  },

  createCheckoutSession: async (accessToken: string, planCode?: string): Promise<string> => {
    // Where Stripe should send the browser back to. createURL returns the right
    // scheme for the current runtime: exp://… in Expo Go, teacher-app://… in a
    // standalone build. The server bounces the browser here after checkout.
    const returnUrl = Linking.createURL('/');
    const res = await fetch(`${FUNCTIONS_URL}/create_checkout_session`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ plan_code: planCode ?? null, return_url: returnUrl }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: { message?: string } };
      throw new Error(json.error?.message ?? 'Failed to create checkout session');
    }
    const json = (await res.json()) as { url: string };
    return json.url;
  },

  maybeShowAd: () => {
    const { subscription, adVisible, thankYouVisible } = get();
    // Only Free users see the ad. If status is unknown (not fetched yet), stay quiet
    // so we never nag a Pro user before their plan loads. Never show it on top of
    // the post-payment thank-you (the teacher just paid).
    if (!subscription || isPro(subscription) || adVisible || thankYouVisible) return;
    const now = Date.now();
    if (now - lastAdShownAt < AD_COOLDOWN_MS) return;
    lastAdShownAt = now;
    set({ adVisible: true });
  },

  hideAd: () => set({ adVisible: false }),

  // Returning from a successful checkout: never show the upgrade ad, show the
  // thank-you instead, and re-check status so Pro unlocks as soon as the webhook
  // lands. (is_pro may still be false here if the webhook hasn't fired yet.)
  showThankYou: () => set({ thankYouVisible: true, adVisible: false }),
  hideThankYou: () => set({ thankYouVisible: false }),

  clear: () => set({ subscription: null, invoices: [], loading: false, cancelling: false, reactivating: false, error: null, adVisible: false, thankYouVisible: false }),
}));

/** Look up a plan by its code in the live list (falls back to built-ins). */
export function planByCode(plans: Plan[], code: string | undefined | null): Plan | null {
  if (!code) return null;
  return plans.find((p) => p.code === code) ?? PLANS.find((p) => p.code === code) ?? null;
}

/** Human-friendly plan name for a subscription's plan_code. */
export function planDisplayName(plans: Plan[], code: string | undefined | null): string {
  const plan = planByCode(plans, code);
  if (plan) return plan.name;
  if (code === 'pro_monthly') return 'Pro (legacy)';
  if (code === 'pro_override') return 'Pro';
  return code ?? 'Unknown';
}

/** Student limit for the teacher's current plan. null = unlimited/unknown. */
export function currentStudentLimit(sub: Subscription | null, plans: Plan[]): number | null {
  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) return null;
  return planByCode(plans, sub.plan_code)?.maxStudents ?? null;
}

export function isPro(sub: Subscription | null): boolean {
  return sub?.is_pro === true;
}

/** React hook: true when the teacher is on Pro/trial. False on Free or unknown. */
export function useIsPro(): boolean {
  return useSubscriptionStore((s) => isPro(s.subscription));
}

/**
 * True while the teacher is allowed to use the app: either paying (active) or
 * still inside the 14-day trial window. Note we check current_period_end here
 * rather than trusting status alone, because a 'trialing' row stays 'trialing'
 * in the DB even after the trial date has passed.
 */
export function hasActiveAccess(sub: Subscription | null): boolean {
  if (!sub) return false;
  if (sub.status === 'active') return true;
  if (sub.status === 'trialing') {
    if (!sub.current_period_end) return true;
    return new Date(sub.current_period_end).getTime() > Date.now();
  }
  return false;
}

/** Whole days left in the trial. 0 when not trialing or already expired. */
export function trialDaysLeft(sub: Subscription | null): number {
  if (!sub || sub.status !== 'trialing' || !sub.current_period_end) return 0;
  const ms = new Date(sub.current_period_end).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}
