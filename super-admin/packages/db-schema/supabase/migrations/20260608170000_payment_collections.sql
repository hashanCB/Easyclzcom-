-- =============================================================================
-- 20260608170000_payment_collections.sql
-- =============================================================================
-- Cash an assistant collects no longer lands straight in the teacher's books.
-- It is saved as a PENDING collection here. The assistant physically hands the
-- money to the teacher, who counts it and reconciles against this list:
--   * Confirm  → creates the real `payments` row (money is now in the books).
--   * Reject   → flags a discrepancy (cash not received / wrong amount).
-- Pending collections never affect dues/income totals because they live outside
-- `payments`, exactly like student_submissions sits outside `students`.
-- =============================================================================

create table if not exists public.payment_collections (
  id                      uuid primary key,
  teacher_id              uuid not null,
  class_id                uuid not null references public.classes(id) on delete cascade,
  created_by_assistant_id uuid references public.assistants(id) on delete set null,
  student_id              uuid not null,
  student_name            text not null,     -- snapshot for the handover list
  month                   text not null,     -- YYYY-MM the payment is for
  amount_cents            integer not null check (amount_cents >= 0),
  -- Full payment domain payload (camelCase), used to create the real payment.
  payload                 jsonb not null,
  status                  text not null default 'pending'
                            check (status in ('pending', 'confirmed', 'rejected')),
  resulting_payment_id    uuid,
  review_note             text,
  collected_at            timestamptz not null default now(),
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now()
);

create index if not exists payment_collections_teacher_status_idx
  on public.payment_collections (teacher_id, status);
create index if not exists payment_collections_assistant_idx
  on public.payment_collections (created_by_assistant_id);

alter table public.payment_collections enable row level security;

-- Teacher owns every collection addressed to them (read + confirm/reject).
drop policy if exists "payment_collections_teacher_all" on public.payment_collections;
create policy "payment_collections_teacher_all"
  on public.payment_collections for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Assistant may record a collection for a class they have payment access to.
drop policy if exists "payment_collections_assistant_insert" on public.payment_collections;
create policy "payment_collections_assistant_insert"
  on public.payment_collections for insert
  with check (
    public.assistant_has_class_access(class_id, 'payment')
    and created_by_assistant_id = auth.uid()
    and teacher_id = (select teacher_id from public.classes where id = class_id)
    and public.teacher_is_pro(teacher_id)
  );

-- Assistant may read back their own collections (for their summary).
drop policy if exists "payment_collections_assistant_select" on public.payment_collections;
create policy "payment_collections_assistant_select"
  on public.payment_collections for select
  using (created_by_assistant_id = auth.uid());

-- Assistants now hand cash over for review, so remove the direct payment insert.
drop policy if exists "payments_assistant_insert" on public.payments;
