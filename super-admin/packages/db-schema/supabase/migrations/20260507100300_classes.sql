-- =============================================================================
-- 20260507100300_classes.sql
-- Class configurations per SRS §7. Each class belongs to a teacher tenant.
-- =============================================================================

create table public.classes (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  class_type          text not null check (class_type in ('al', 'ol', 'other')),
  custom_class_type   text,
  grade               text not null,
  batch               text not null,
  subject             text not null,
  language            text not null check (language in ('sinhala', 'english', 'tamil', 'other')),

  monthly_fee_cents   bigint not null check (monthly_fee_cents >= 0),
  location            text,
  remark              text,
  image_url           text,
  is_active           boolean not null default true,

  -- Payment reminder schedule (SRS §13.3)
  payment_reminder_day_of_month  smallint check (payment_reminder_day_of_month between 1 and 28),
  payment_reminder_time          time,
  payment_reminder_active        boolean not null default true,

  -- Class session schedule (SRS §12.6 — drives QR/NFC grace windows)
  class_day                text not null check (class_day in
    ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  class_start_time         time not null,
  class_end_time           time not null,
  qr_grace_minutes_before  integer not null default 30 check (qr_grace_minutes_before >= 0),
  qr_grace_minutes_after   integer not null default 30 check (qr_grace_minutes_after >= 0),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index classes_teacher_idx        on public.classes (teacher_id) where deleted_at is null;
create index classes_teacher_active_idx on public.classes (teacher_id, is_active) where deleted_at is null;
create index classes_subject_trgm_idx   on public.classes using gin (subject extensions.gin_trgm_ops);

create trigger classes_set_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;

create policy "classes_super_admin_all"
  on public.classes for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "classes_teacher_all"
  on public.classes for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

comment on table public.classes is 'Class configurations per SRS §7.';
