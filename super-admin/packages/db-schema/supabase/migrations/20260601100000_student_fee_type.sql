-- Per-student fee type.
-- 'regular' → uses the class monthly fee (default, existing behaviour)
-- 'free'    → student owes nothing
-- 'custom'  → uses custom_fee_cents (a discount set below the class fee)
-- Nullable custom_fee_cents is only meaningful when fee_type = 'custom'.

alter table public.students
  add column if not exists fee_type text not null default 'regular'
    check (fee_type in ('regular', 'free', 'custom')),
  add column if not exists custom_fee_cents integer
    check (custom_fee_cents is null or custom_fee_cents >= 0);
