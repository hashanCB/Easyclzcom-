-- =============================================================================
-- 20260531120000_payment_receipts.sql
-- Server-triggered payment receipt SMS (anti-fraud control).
--
-- When a payment row is INSERTed into the cloud DB (i.e. once a payment recorded
-- on a device — including by an assistant — syncs up), an AFTER INSERT trigger
-- fires the `send_payment_receipt` edge function via pg_net. The function SMSes
-- the parent a receipt for the exact amount recorded and logs the message.
--
-- Why server-side: the receipt is the one fraud control an assistant cannot skip
-- or under-record around. It fires from the row that actually lands in the
-- ledger, not from client code the assistant controls. The parent's receipt is
-- the independent proof of what was truly collected.
--
-- Opt-in: receipts cost real money, so they are sent ONLY for teachers who have
-- explicitly enabled `teachers.send_payment_receipt` (default false).
-- =============================================================================

create extension if not exists pg_net;

-- ---- per-teacher opt-in flag -----------------------------------------------
alter table public.teachers
  add column if not exists send_payment_receipt boolean not null default false;

comment on column public.teachers.send_payment_receipt is
  'When true, every synced payment auto-sends an SMS receipt to the parent. Off by default (each receipt costs money).';

-- ---- allow the new message type --------------------------------------------
-- Extend the type CHECK on both message tables to include payment_received.
alter table public.messages
  drop constraint if exists messages_type_check;
alter table public.messages
  add constraint messages_type_check check (type in
    ('payment_reminder','attendance_absent','attendance_summary',
     'class_cancel','exam_result','note_uploaded','custom','payment_received'));

alter table public.message_templates
  drop constraint if exists message_templates_type_check;
alter table public.message_templates
  add constraint message_templates_type_check check (type in
    ('payment_reminder','attendance_absent','attendance_summary',
     'class_cancel','exam_result','note_uploaded','custom','payment_received'));

-- ---- link a receipt message back to its payment ----------------------------
-- Lets the teacher UI show "receipt sent/failed" against each payment, and lets
-- the edge function stay idempotent (skip if a receipt already exists).
alter table public.messages
  add column if not exists payment_id uuid references public.payments(id) on delete set null;

create index if not exists messages_payment_idx
  on public.messages (payment_id) where payment_id is not null;

-- ---- trigger: fire the receipt edge function on payment insert -------------
-- SECURITY DEFINER so it can read the teacher flag and the vault secret. The
-- HTTP call is async (pg_net queues it) so it never blocks the sync write.
create or replace function public.notify_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_enabled boolean;
  v_secret  text;
begin
  -- Only receipts for money actually received.
  if new.deleted_at is not null
     or new.status not in ('paid','partial','advance')
     or new.amount_cents <= 0 then
    return new;
  end if;

  -- Opt-in check — skip teachers who haven't enabled receipts.
  select send_payment_receipt into v_enabled
  from public.teachers where id = new.teacher_id;
  if v_enabled is not true then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_secret is null then
    -- No secret configured → can't authenticate to the edge function. Don't
    -- fail the payment write; just skip (receipts are best-effort).
    return new;
  end if;

  perform net.http_post(
    url     := 'https://kesssbvejyeefyaqjobk.supabase.co/functions/v1/send_payment_receipt',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := jsonb_build_object('payment_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists payments_send_receipt on public.payments;
create trigger payments_send_receipt
after insert on public.payments
for each row execute function public.notify_payment_receipt();

comment on function public.notify_payment_receipt is
  'AFTER INSERT on payments: calls the send_payment_receipt edge function (opt-in per teacher) to SMS the parent a receipt.';
