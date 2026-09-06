-- =============================================================================
-- 20260507101000_messages.sql
-- SMS / WhatsApp / push outbound queue + reusable templates per SRS §13–14.
-- =============================================================================

create table public.message_templates (
  id                  uuid primary key default extensions.gen_random_uuid(),
  teacher_id          uuid not null references public.teachers(id) on delete cascade,

  type                text not null check (type in
    ('payment_reminder','attendance_absent','attendance_summary',
     'class_cancel','exam_result','note_uploaded','custom')),
  language            text not null default 'english' check (language in
    ('sinhala','english','tamil','other')),
  body                text not null,
  is_default          boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  client_updated_at   timestamptz,
  synced_at           timestamptz
);

create index msg_templates_teacher_idx on public.message_templates (teacher_id) where deleted_at is null;

-- A teacher can have at most one default template per (type, language).
create unique index msg_templates_one_default_idx
  on public.message_templates (teacher_id, type, language)
  where is_default = true and deleted_at is null;

create trigger msg_templates_set_updated_at
before update on public.message_templates
for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;

create policy "msg_templates_super_admin_all"
  on public.message_templates for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "msg_templates_teacher_all"
  on public.message_templates for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- ---- messages --------------------------------------------------------------
create table public.messages (
  id                    uuid primary key default extensions.gen_random_uuid(),
  teacher_id            uuid not null references public.teachers(id) on delete cascade,

  type                  text not null check (type in
    ('payment_reminder','attendance_absent','attendance_summary',
     'class_cancel','exam_result','note_uploaded','custom')),
  channel               text not null default 'sms' check (channel in
    ('sms','whatsapp','push','in_app')),
  status                text not null default 'queued' check (status in
    ('queued','sent','delivered','failed','cancelled')),

  recipient_phone       text not null,
  student_id            uuid references public.students(id) on delete set null,
  class_id              uuid references public.classes(id)  on delete set null,
  body                  text not null,

  scheduled_at          timestamptz,
  sent_at               timestamptz,
  delivered_at          timestamptz,
  failed_at             timestamptz,
  error                 text,
  retry_count           integer not null default 0 check (retry_count >= 0),
  provider              text,
  provider_message_id   text,
  cost_cents            bigint check (cost_cents is null or cost_cents >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  client_updated_at     timestamptz,
  synced_at             timestamptz
);

create index messages_teacher_status_idx    on public.messages (teacher_id, status);
create index messages_teacher_created_idx   on public.messages (teacher_id, created_at desc);
create index messages_scheduled_idx         on public.messages (scheduled_at) where status = 'queued';
create index messages_class_idx             on public.messages (class_id) where class_id is not null;
create index messages_student_idx           on public.messages (student_id) where student_id is not null;

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

alter table public.messages enable row level security;

create policy "messages_super_admin_all"
  on public.messages for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "messages_teacher_all"
  on public.messages for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

comment on table public.message_templates is 'Reusable message templates per SRS §14.';
comment on table public.messages is 'Outbound message log + queue (SMS/WhatsApp/push/in-app).';
