-- Add support contact phone to app_settings.
-- Super admin can change this from the settings page.
INSERT INTO app_settings (key, value)
  VALUES ('support_contact_phone', '0776465456')
  ON CONFLICT (key) DO NOTHING;
