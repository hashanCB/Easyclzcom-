-- =============================================================================
-- 20260603140000_support_phone_public_read.sql
-- Let signed-in users read the support contact phone.
--
-- app_settings has RLS enabled with NO policies (service-role only). The teacher
-- and assistant apps need the support phone to power an in-app "Help & Support"
-- screen (WhatsApp / Call / SMS). Rather than open the whole table, this adds a
-- narrow SELECT policy that exposes ONLY the public, non-sensitive keys. Other
-- keys (SMS sender config, demo flags, etc.) stay invisible to clients.
-- =============================================================================

-- Whitelist of keys that are safe for any authenticated client to read.
create policy "app_settings_public_read"
  on public.app_settings
  for select
  to authenticated
  using (key in ('support_contact_phone'));

comment on policy "app_settings_public_read" on public.app_settings is
  'Allows signed-in clients to read only the whitelisted public settings (support_contact_phone). All other keys remain service-role only.';
