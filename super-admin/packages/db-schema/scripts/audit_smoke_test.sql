-- =============================================================================
-- audit_smoke_test.sql  — verifies the U44 audit triggers + SYNC-5 mapping
-- =============================================================================
-- HOW TO RUN: paste into the Supabase SQL Editor and Run. SAFE: everything is
-- inside a transaction that ROLLS BACK, so nothing persists (even the
-- append-only audit rows are undone). Results show as a TABLE in the Results
-- pane: each row is one check with status PASS / FAIL / SKIP.
--
-- Prereq: migration 20260522120000_audit_triggers.sql is applied.
-- Reuses existing rows, so checks with no data of that type report SKIP.
-- =============================================================================

begin;

create temp table _smoke (ord int, check_name text, status text, detail text) on commit drop;

-- 1) payment correction / refund — inserts exactly what the SYNC-5 push sends.
do $$
declare v_pay public.payments; v_n int;
begin
  select * into v_pay from public.payments where deleted_at is null order by created_at desc limit 1;
  if v_pay.id is null then
    insert into _smoke values (1, 'payment.refund', 'SKIP', 'no payments in project');
  else
    insert into public.payment_corrections
      (teacher_id, original_payment_id, student_id, class_id, month,
       original_amount_cents, corrected_amount_cents, reason,
       done_by_user_id, done_by_role, done_at)
    values
      (v_pay.teacher_id, v_pay.id, v_pay.student_id, v_pay.class_id, v_pay.month,
       v_pay.amount_cents, v_pay.amount_cents - 5000, 'smoke test refund',
       v_pay.teacher_id, 'teacher', now());
    select count(*) into v_n from public.audit_logs
      where entity_id = v_pay.id and action = 'payment.refund';
    insert into _smoke values (1, 'payment.refund',
      case when v_n >= 1 then 'PASS' else 'FAIL' end,
      'audit rows: ' || v_n);
  end if;
end $$;

-- 2) student.update — UPDATE gated on client_updated_at change.
do $$
declare v_stu public.students; v_n int;
begin
  select * into v_stu from public.students where deleted_at is null order by created_at desc limit 1;
  if v_stu.id is null then
    insert into _smoke values (2, 'student.update', 'SKIP', 'no students in project');
  else
    update public.students set name = name || ' (smoke)', client_updated_at = now() where id = v_stu.id;
    select count(*) into v_n from public.audit_logs
      where entity_id = v_stu.id and action in ('student.update','student.deactivate');
    insert into _smoke values (2, 'student.update',
      case when v_n >= 1 then 'PASS' else 'FAIL' end, 'audit rows: ' || v_n);
  end if;
end $$;

-- 3) attendance.update.
do $$
declare v_att public.attendance; v_n int;
begin
  select * into v_att from public.attendance where deleted_at is null order by created_at desc limit 1;
  if v_att.id is null then
    insert into _smoke values (3, 'attendance.update', 'SKIP', 'no attendance in project');
  else
    update public.attendance
      set status = case when status='present' then 'late' else 'present' end,
          client_updated_at = now()
      where id = v_att.id;
    select count(*) into v_n from public.audit_logs
      where entity_id = v_att.id and action = 'attendance.update';
    insert into _smoke values (3, 'attendance.update',
      case when v_n >= 1 then 'PASS' else 'FAIL' end, 'audit rows: ' || v_n);
  end if;
end $$;

-- 4) subscription status change.
do $$
declare v_sub public.subscriptions; v_n int;
begin
  select * into v_sub from public.subscriptions order by created_at desc limit 1;
  if v_sub.id is null then
    insert into _smoke values (4, 'subscription.change', 'SKIP', 'no subscriptions in project');
  else
    update public.subscriptions
      set status = case when status='active' then 'past_due' else 'active' end
      where id = v_sub.id;
    select count(*) into v_n from public.audit_logs
      where entity_id = v_sub.id and action in ('subscription.activate','subscription.cancel');
    insert into _smoke values (4, 'subscription.change',
      case when v_n >= 1 then 'PASS' else 'FAIL' end, 'audit rows: ' || v_n);
  end if;
end $$;

-- 5) idempotency — a no-op update (client_updated_at unchanged) must NOT log.
do $$
declare v_stu public.students; v_before int; v_after int;
begin
  select * into v_stu from public.students where deleted_at is null order by created_at desc limit 1;
  if v_stu.id is null then
    insert into _smoke values (5, 'idempotency', 'SKIP', 'no students');
  else
    select count(*) into v_before from public.audit_logs where entity_id = v_stu.id;
    update public.students set updated_at = now() where id = v_stu.id;  -- client_updated_at unchanged
    select count(*) into v_after from public.audit_logs where entity_id = v_stu.id;
    insert into _smoke values (5, 'idempotency',
      case when v_after = v_before then 'PASS' else 'FAIL' end,
      'extra rows: ' || (v_after - v_before));
  end if;
end $$;

select check_name, status, detail from _smoke order by ord;

rollback;
