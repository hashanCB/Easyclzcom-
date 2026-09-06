-- Seed the SMS sender name setting (uses the existing key-value app_settings table).
INSERT INTO app_settings (key, value)
  VALUES ('sms_sender_name', 'QKSendDemo')
  ON CONFLICT (key) DO NOTHING;
