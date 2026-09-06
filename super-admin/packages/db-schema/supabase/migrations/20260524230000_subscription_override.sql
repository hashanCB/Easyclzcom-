-- Subscription override support for super admin (U25 lifecycle)
-- Adds override_reason column so manual grants are auditable.

alter table public.subscriptions
  add column if not exists override_reason text;

comment on column public.subscriptions.override_reason
  is 'Non-null when super admin manually granted or extended this subscription (e.g. "VIP promo", "support credit").';
