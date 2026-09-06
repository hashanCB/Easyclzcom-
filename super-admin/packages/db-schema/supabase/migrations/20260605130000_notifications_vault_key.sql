-- =============================================================================
-- 20260605130000_notifications_vault_key.sql
-- Read the service-role key for the dispatch_push fan-out from Supabase Vault.
--
-- Why: Supabase's managed `postgres` role cannot set custom GUCs
-- (`ALTER DATABASE/ROLE ... SET app.settings.service_role_key` is denied), so
-- the original create_notification() read of current_setting() always returned
-- NULL and the trigger-based phone push never authenticated. The supported way
-- to hold a server secret is Vault. The secret named 'service_role_key' is
-- stored once via vault.create_secret() (out of band, not in this migration so
-- the key is never committed) and read here through vault.decrypted_secrets.
--
-- Still fully best-effort: if the secret is missing or pg_net is unavailable the
-- in-app notification row is already saved and the caller's transaction commits.
-- =============================================================================

create or replace function public.create_notification(
  p_teacher_id uuid,
  p_type       text,
  p_title      text,
  p_body       text,
  p_data       jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_key text;
begin
  insert into public.notifications (teacher_id, type, title, body, data)
  values (p_teacher_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  -- Best-effort phone push. Wrapped so a missing secret / disabled pg_net can
  -- never roll back the caller's transaction.
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;

    if v_key is not null then
      perform net.http_post(
        url     := 'https://kesssbvejyeefyaqjobk.supabase.co/functions/v1/dispatch_push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object('notification_id', v_id)
      );
    end if;
  exception when others then
    -- Vault unreadable / pg_net missing: in-app notification still saved.
    null;
  end;

  return v_id;
end;
$$;
