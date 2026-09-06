-- Add collection location to payments.
-- Records where the payment was physically collected (e.g. "At class", "Home visit").
-- Nullable — existing rows and payments without a location stay null.

alter table public.payments
  add column if not exists location text check (char_length(location) <= 200);
