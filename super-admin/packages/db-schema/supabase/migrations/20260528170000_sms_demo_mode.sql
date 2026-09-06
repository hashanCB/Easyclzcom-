-- SMS demo mode flag.
-- 'true'  → always use QKSendDemo (QuickSend demo sender, no registration needed).
-- 'false' → use the configured sms_sender_name (must be registered in QuickSend).
INSERT INTO app_settings (key, value)
  VALUES ('sms_demo_mode', 'true')
  ON CONFLICT (key) DO NOTHING;
