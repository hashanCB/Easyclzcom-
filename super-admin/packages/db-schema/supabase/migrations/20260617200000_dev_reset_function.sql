-- =============================================================================
-- dev_reset_data() — wipe all tenant data for testing purposes.
-- =============================================================================

create or replace function public.dev_reset_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  counts jsonb := '{}';
  n      bigint;
begin
  -- Disable per-row triggers so block-delete guards (payments, audit_logs, etc.)
  -- don't fire.  session_replication_role = replica skips non-replica triggers.
  set local session_replication_role = replica;

  delete from student_notifications      where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('student_notifications', n);
  delete from student_push_subscriptions where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('student_push_subscriptions', n);
  delete from analytics_events           where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('analytics_events', n);
  delete from audit_logs                 where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('audit_logs', n);
  delete from system_alerts              where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('system_alerts', n);
  delete from notifications              where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('notifications', n);
  delete from push_tokens                where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('push_tokens', n);
  delete from reminder_dispatch_log      where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('reminder_dispatch_log', n);
  delete from marks                      where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('marks', n);
  delete from exams                      where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('exams', n);
  delete from payment_corrections        where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('payment_corrections', n);
  delete from payment_collections        where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('payment_collections', n);
  delete from payments                   where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('payments', n);
  delete from attendance                 where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('attendance', n);
  delete from student_submissions        where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('student_submissions', n);
  delete from chat_messages              where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('chat_messages', n);
  delete from chat_threads               where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('chat_threads', n);
  delete from class_join_requests        where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('class_join_requests', n);
  delete from student_account_links      where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('student_account_links', n);
  delete from students                   where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('students', n);
  delete from notes                      where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('notes', n);
  delete from note_files                 where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('note_files', n);
  delete from messages                   where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('messages', n);
  delete from message_templates          where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('message_templates', n);
  delete from subscription_events        where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('subscription_events', n);
  delete from subscriptions              where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('subscriptions', n);
  delete from teacher_password_reset_otps where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('teacher_password_reset_otps', n);
  delete from teacher_registration_otps  where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('teacher_registration_otps', n);
  delete from password_reset_otps        where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('password_reset_otps', n);
  delete from phone_change_otps          where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('phone_change_otps', n);
  delete from login_attempts             where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('login_attempts', n);
  delete from duplicate_token_attempts   where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('duplicate_token_attempts', n);
  delete from teacher_tokens             where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('teacher_tokens', n);
  delete from teacher_sessions           where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('teacher_sessions', n);
  delete from sync_state                 where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('sync_state', n);
  delete from assistant_class_permissions where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('assistant_class_permissions', n);
  delete from assistants                 where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('assistants', n);
  delete from classes                    where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('classes', n);
  delete from teachers                   where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('teachers', n);
  delete from student_accounts           where true; get diagnostics n = row_count; counts := counts || jsonb_build_object('student_accounts', n);
  -- Keep the super admin role row.
  delete from user_roles where user_id != '00000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count; counts := counts || jsonb_build_object('user_roles', n);

  set local session_replication_role = default;
  return counts;
end;
$$;

revoke execute on function public.dev_reset_data() from public, anon, authenticated;
grant  execute on function public.dev_reset_data() to service_role;
