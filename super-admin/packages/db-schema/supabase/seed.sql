-- =============================================================================
-- Local-development seed.
-- Runs after `supabase db reset`. NEVER run against the cloud project — the
-- direct inserts into auth.users are intentional shortcuts for local dev.
--
-- Creates:
--   1 super admin   — username: superadmin   / Password: SuperAdmin123!
--   1 demo teacher  — username: demo_teacher / Password: Teacher123!
-- Auth login emails follow the {username}@teachers.local pattern that the
-- U07 edge functions expect.
-- =============================================================================

-- Wipe app tables in dependency order so reseeding is idempotent.
truncate
  public.audit_logs,
  public.sync_state,
  public.subscription_events,
  public.subscriptions,
  public.chat_messages,
  public.chat_threads,
  public.messages,
  public.message_templates,
  public.note_files,
  public.notes,
  public.marks,
  public.exams,
  public.attendance,
  public.payment_corrections,
  public.payments,
  public.assistant_class_permissions,
  public.assistants,
  public.student_credentials,
  public.students,
  public.classes,
  public.duplicate_token_attempts,
  public.teacher_sessions,
  public.teacher_tokens,
  public.teachers,
  public.user_roles
restart identity cascade;

-- Drop any prior seeded auth users so the run is idempotent.
delete from auth.users where email in ('superadmin@teachers.local', 'demo_teacher@teachers.local');

-- ---- Super admin -----------------------------------------------------------
-- Pinned UUID so subsequent seed runs are stable.
do $$
declare
  super_admin_id uuid := '00000000-0000-0000-0000-000000000001';
  demo_teacher_id uuid := '00000000-0000-0000-0000-000000000002';
begin
  -- Super admin auth row
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    super_admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'superadmin@teachers.local',
    extensions.crypt('SuperAdmin123!', extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('display_name', 'Local Super Admin'),
    '', '', '', '', '', '', '', ''
  );

  insert into public.user_roles (user_id, role) values (super_admin_id, 'super_admin');

  -- Demo teacher auth row
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    demo_teacher_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo_teacher@teachers.local',
    extensions.crypt('Teacher123!', extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('display_name', 'Demo Teacher'),
    '', '', '', '', '', '', '', ''
  );

  insert into public.user_roles (user_id, role) values (demo_teacher_id, 'teacher');

  insert into public.teachers (
    id, username, name, phone, email, gender, is_active, is_profile_complete
  ) values (
    demo_teacher_id, 'demo_teacher', 'Demo Teacher',
    '+94770000000', 'demo@example.com', 'prefer_not_to_say',
    true, true
  );

  -- A pre-bound activation token for the demo teacher (token plaintext is
  -- '123456789012'; the hash matches what shared-utils' QR helpers produce).
  insert into public.teacher_tokens (teacher_id, token_hash, bound_device_id, bound_at)
  values (
    demo_teacher_id,
    encode(extensions.digest('123456789012', 'sha256'), 'hex'),
    'local-dev-device',
    now()
  );

  insert into public.subscriptions (teacher_id, status, plan_code)
  values (demo_teacher_id, 'inactive', 'pro_monthly');

  raise notice 'Seed: super admin  → username=superadmin   password=SuperAdmin123!';
  raise notice 'Seed: demo teacher → username=demo_teacher password=Teacher123! token=123456789012';
end $$;
