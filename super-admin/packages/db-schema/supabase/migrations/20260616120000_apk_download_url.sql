-- =============================================================================
-- 20260616120000_apk_download_url.sql
-- App download link (Android APK) shown on the easyclz.com marketing site.
--
-- The super-admin "Website" page sets this. The easyclz.com hero "Google Play"
-- button reads it so the link can change without redeploying the website.
-- easyclz.com is a logged-out marketing site, so the value must be readable by
-- the anon role. Only this one key is exposed; all other settings stay locked.
-- =============================================================================

INSERT INTO app_settings (key, value)
  VALUES ('apk_download_url', '')
  ON CONFLICT (key) DO NOTHING;

-- Narrow public-read policy: anon + authenticated may read ONLY the apk link.
drop policy if exists "app_settings_apk_public_read" on public.app_settings;
create policy "app_settings_apk_public_read"
  on public.app_settings
  for select
  to anon, authenticated
  using (key in ('apk_download_url'));

comment on policy "app_settings_apk_public_read" on public.app_settings is
  'Allows any client (incl. logged-out easyclz.com) to read only apk_download_url. All other keys remain service-role only.';
