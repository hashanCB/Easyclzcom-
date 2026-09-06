-- =============================================================================
-- Notify student when join_status flips to 'confirmed' (money gate lifted).
-- Adds 'payment_confirmed' to the student_notifications type check and creates
-- a trigger on students UPDATE that fires the push for the enrolled account.
-- =============================================================================

-- 1. Widen the type check to include the new notification kind.
alter table public.student_notifications
  drop constraint if exists student_notifications_type_check;

alter table public.student_notifications
  add constraint student_notifications_type_check
  check (type in ('chat', 'exam', 'note', 'payment_confirmed'));

-- 2. Trigger function: fires when join_status changes pending_payment → confirmed.
create or replace function public.notify_student_confirmed() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.join_status = 'pending_payment'
     and new.join_status = 'confirmed'
     and new.deleted_at is null
  then
    begin
      perform public.create_student_notification(
        new.id,
        'payment_confirmed',
        'You''re all set!',
        'Your first payment has been confirmed. You are now fully enrolled in the class.'
      );
    exception when others then
      null; -- never block the student update
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists students_notify_confirmed on public.students;
create trigger students_notify_confirmed
  after update on public.students
  for each row execute function public.notify_student_confirmed();
