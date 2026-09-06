-- =============================================================================
-- 20260507100600_payments.sql
-- Payments + payment_corrections per SRS §10.
-- Hard rule (SRS §10.6): payment rows are never deleted. Mistakes create a
-- correction row that adjusts the running total. The DB enforces this — the
-- API does not expose DELETE on `payments`.
-- =============================================================================

create table public.payments (
  id                    uuid primary key default extensions.gen_random_uuid(),
  teacher_id            uuid not null references public.teachers(id) on delete cascade,

  student_id            uuid not null references public.students(id) on delete restrict,
  class_id              uuid not null references public.classes(id)  on delete restrict,
  month                 text not null check (month ~ '^\d{4}-\d{2}$'),  -- YYYY-MM
  amount_cents          bigint not null check (amount_cents >= 0),
  status                text not null check (status in
    ('paid','unpaid','partial','advance','free','refunded','corrected')),
  method                text not null default 'cash' check (method in
    ('cash','bank_transfer','card','mobile','other')),
  remark                text,

  collected_by_user_id  uuid not null,
  collected_by_role     text not null check (collected_by_role in ('teacher', 'assistant')),
  collected_at          timestamptz not null default now(),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  client_updated_at     timestamptz,
  synced_at             timestamptz
);

create index payments_teacher_month_idx       on public.payments (teacher_id, month);
create index payments_student_month_idx       on public.payments (student_id, month);
create index payments_class_month_idx         on public.payments (class_id, month);
create index payments_collected_at_idx        on public.payments (teacher_id, collected_at desc);
create index payments_status_idx              on public.payments (teacher_id, status) where deleted_at is null;

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- Block raw deletes — corrections must be used instead.
create or replace function public.payments_block_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payments rows cannot be deleted; create a payment_corrections row instead'
    using errcode = 'restrict_violation';
end;
$$;

create trigger payments_block_delete
before delete on public.payments
for each row execute function public.payments_block_delete();

alter table public.payments enable row level security;

create policy "payments_super_admin_all"
  on public.payments for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "payments_teacher_all"
  on public.payments for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Assistant: can read + insert payments on classes they have 'payment' or
-- 'both' permission for. Cannot update/delete (corrections are teacher-only).
create policy "payments_assistant_select"
  on public.payments for select
  using (public.assistant_has_class_access(class_id, 'payment'));

create policy "payments_assistant_insert"
  on public.payments for insert
  with check (
    public.assistant_has_class_access(class_id, 'payment')
    and collected_by_role = 'assistant'
    and collected_by_user_id = auth.uid()
  );

-- Student: read own payment status only (SRS §17.3 — no income totals).
create policy "payments_student_self_select"
  on public.payments for select
  using (
    public.is_student()
    and student_id in (
      select id from public.students where auth_user_id = auth.uid()
    )
  );

-- ---- payment_corrections ---------------------------------------------------
create table public.payment_corrections (
  id                          uuid primary key default extensions.gen_random_uuid(),
  teacher_id                  uuid not null references public.teachers(id) on delete cascade,

  original_payment_id         uuid not null references public.payments(id) on delete restrict,
  student_id                  uuid not null references public.students(id) on delete restrict,
  class_id                    uuid not null references public.classes(id)  on delete restrict,
  month                       text not null check (month ~ '^\d{4}-\d{2}$'),

  original_amount_cents       bigint not null,
  corrected_amount_cents      bigint not null,
  difference_amount_cents     bigint not null
    generated always as (corrected_amount_cents - original_amount_cents) stored,

  reason                      text not null,
  done_by_user_id             uuid not null,
  done_by_role                text not null check (done_by_role in ('teacher', 'assistant')),
  done_at                     timestamptz not null default now(),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz,
  client_updated_at           timestamptz,
  synced_at                   timestamptz
);

create index pc_teacher_month_idx    on public.payment_corrections (teacher_id, month);
create index pc_original_payment_idx on public.payment_corrections (original_payment_id);
create index pc_student_idx          on public.payment_corrections (student_id, month);

create trigger pc_set_updated_at
before update on public.payment_corrections
for each row execute function public.set_updated_at();

alter table public.payment_corrections enable row level security;

create policy "pc_super_admin_all"
  on public.payment_corrections for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "pc_teacher_all"
  on public.payment_corrections for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

comment on table public.payments is 'Money collected per student per month. Never deleted — corrections only.';
comment on table public.payment_corrections is 'Adjustment rows for payment fixes / refunds (SRS §10.6).';
