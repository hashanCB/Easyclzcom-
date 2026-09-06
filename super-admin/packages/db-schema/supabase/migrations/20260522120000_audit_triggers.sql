-- =============================================================================
-- 20260522120000_audit_triggers.sql  (U44 — Audit Log Wiring, SRS §24.4)
-- =============================================================================
-- Writes append-only audit_logs rows for the SRS §24.4 actions that flow through
-- data tables (payment collection/correction/refund, attendance, student/class
-- update, subscription status change). Server-only actions (assistant login,
-- backup restore) are logged from edge functions / the log_audit function.
--
-- Why triggers: the app is offline-first, so these rows are written when the
-- change reaches the cloud via sync-upsert. Triggers capture old/new values for
-- free and cannot be bypassed by a client.
--
-- "Exactly one audit row per action": UPDATE triggers fire only when
-- client_updated_at actually changes — that field bumps on every genuine local
-- edit (see repo mutations) but NOT on a no-op merge-duplicate re-sync.
--
-- Functions are SECURITY DEFINER so they can insert into audit_logs, which has
-- RLS enabled and no INSERT policy (writes are owner/service-role only).
-- =============================================================================

-- ---- payments: collection -------------------------------------------------
create or replace function public.audit_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  insert into public.audit_logs
    (teacher_id, user_id, user_role, action, entity_type, entity_id, new_value, occurred_at)
  values
    (new.teacher_id, new.collected_by_user_id, new.collected_by_role,
     'payment.collect', 'payment', new.id,
     jsonb_build_object(
       'student_id', new.student_id, 'class_id', new.class_id,
       'month', new.month, 'amount_cents', new.amount_cents,
       'status', new.status, 'method', new.method),
     coalesce(new.collected_at, now()));
  return new;
end;
$$;

drop trigger if exists audit_payments_insert on public.payments;
create trigger audit_payments_insert
after insert on public.payments
for each row execute function public.audit_payment_insert();

-- ---- payment_corrections: correction / refund -----------------------------
create or replace function public.audit_payment_correction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  v_action := case
    when new.difference_amount_cents < 0 then 'payment.refund'
    else 'payment.correct'
  end;
  insert into public.audit_logs
    (teacher_id, user_id, user_role, action, entity_type, entity_id,
     old_value, new_value, occurred_at)
  values
    (new.teacher_id, new.done_by_user_id, new.done_by_role,
     v_action, 'payment', new.original_payment_id,
     jsonb_build_object('amount_cents', new.original_amount_cents),
     jsonb_build_object(
       'amount_cents', new.corrected_amount_cents,
       'difference_cents', new.difference_amount_cents,
       'reason', new.reason),
     coalesce(new.done_at, now()));
  return new;
end;
$$;

drop trigger if exists audit_payment_corrections_insert on public.payment_corrections;
create trigger audit_payment_corrections_insert
after insert on public.payment_corrections
for each row execute function public.audit_payment_correction_insert();

-- ---- attendance: mark / update --------------------------------------------
create or replace function public.audit_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      return new;
    end if;
    insert into public.audit_logs
      (teacher_id, user_id, user_role, action, entity_type, entity_id, new_value, occurred_at)
    values
      (new.teacher_id, new.marked_by_user_id, new.marked_by_role,
       'attendance.mark', 'attendance', new.id,
       jsonb_build_object(
         'student_id', new.student_id, 'class_id', new.class_id,
         'date', new.date, 'status', new.status, 'marked_via', new.marked_via),
       coalesce(new.marked_at, now()));
    return new;
  end if;

  -- UPDATE: only when a real edit happened (client_updated_at moved) and the
  -- status or soft-delete actually changed.
  if new.client_updated_at is distinct from old.client_updated_at
     and (new.status is distinct from old.status
          or new.deleted_at is distinct from old.deleted_at) then
    insert into public.audit_logs
      (teacher_id, user_id, user_role, action, entity_type, entity_id,
       old_value, new_value, occurred_at)
    values
      (new.teacher_id, new.marked_by_user_id, new.marked_by_role,
       'attendance.update', 'attendance', new.id,
       jsonb_build_object('status', old.status, 'deleted_at', old.deleted_at),
       jsonb_build_object('status', new.status, 'deleted_at', new.deleted_at),
       now());
  end if;
  return new;
end;
$$;

drop trigger if exists audit_attendance_change on public.attendance;
create trigger audit_attendance_change
after insert or update on public.attendance
for each row execute function public.audit_attendance_change();

-- ---- students: update / deactivate ----------------------------------------
create or replace function public.audit_student_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if new.client_updated_at is not distinct from old.client_updated_at then
    return new;  -- no real edit (e.g. synced_at-only merge)
  end if;
  v_action := case
    when old.is_active = true and new.is_active = false then 'student.deactivate'
    else 'student.update'
  end;
  insert into public.audit_logs
    (teacher_id, user_id, user_role, action, entity_type, entity_id,
     old_value, new_value, occurred_at)
  values
    (new.teacher_id, new.teacher_id, 'teacher',
     v_action, 'student', new.id,
     jsonb_build_object('name', old.name, 'is_active', old.is_active,
                        'deleted_at', old.deleted_at),
     jsonb_build_object('name', new.name, 'is_active', new.is_active,
                        'deleted_at', new.deleted_at),
     now());
  return new;
end;
$$;

drop trigger if exists audit_students_update on public.students;
create trigger audit_students_update
after update on public.students
for each row execute function public.audit_student_update();

-- ---- classes: update / deactivate -----------------------------------------
create or replace function public.audit_class_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if new.client_updated_at is not distinct from old.client_updated_at then
    return new;
  end if;
  v_action := case
    when old.is_active = true and new.is_active = false then 'class.deactivate'
    else 'class.update'
  end;
  insert into public.audit_logs
    (teacher_id, user_id, user_role, action, entity_type, entity_id,
     old_value, new_value, occurred_at)
  values
    (new.teacher_id, new.teacher_id, 'teacher',
     v_action, 'class', new.id,
     jsonb_build_object('is_active', old.is_active, 'deleted_at', old.deleted_at),
     jsonb_build_object('is_active', new.is_active, 'deleted_at', new.deleted_at),
     now());
  return new;
end;
$$;

drop trigger if exists audit_classes_update on public.classes;
create trigger audit_classes_update
after update on public.classes
for each row execute function public.audit_class_update();

-- ---- subscriptions: status change -----------------------------------------
create or replace function public.audit_subscription_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  if new.status is not distinct from old.status then
    return new;  -- nothing changed
  end if;
  v_action := case
    when new.status in ('active', 'trialing') then 'subscription.activate'
    else 'subscription.cancel'  -- cancelled / past_due / incomplete / inactive
  end;
  insert into public.audit_logs
    (teacher_id, user_id, user_role, action, entity_type, entity_id,
     old_value, new_value, occurred_at)
  values
    (new.teacher_id, new.teacher_id, 'teacher',
     v_action, 'subscription', new.id,
     jsonb_build_object('status', old.status),
     jsonb_build_object('status', new.status, 'plan_code', new.plan_code),
     now());
  return new;
end;
$$;

drop trigger if exists audit_subscriptions_status on public.subscriptions;
create trigger audit_subscriptions_status
after update on public.subscriptions
for each row execute function public.audit_subscription_status();

comment on function public.audit_payment_insert is 'U44: audit payment collection (SRS §24.4)';
comment on function public.audit_payment_correction_insert is 'U44: audit payment correction/refund';
comment on function public.audit_attendance_change is 'U44: audit attendance mark/update';
comment on function public.audit_student_update is 'U44: audit student update/deactivate';
comment on function public.audit_class_update is 'U44: audit class update/deactivate';
comment on function public.audit_subscription_status is 'U44: audit subscription status change';
