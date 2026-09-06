-- =============================================================================
-- app_settings — global key/value settings editable from the super-admin panel.
-- Used for things that must change without a redeploy, e.g. the student-web URL
-- that join/invite links point to.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed the student-web base URL. Edge functions fall back to env/default if absent.
INSERT INTO app_settings (key, value)
VALUES ('student_web_url', 'http://localhost:3100')
ON CONFLICT (key) DO NOTHING;

-- Lock down: only the service role (edge functions + admin server actions) may
-- touch this table. RLS on with no policies = deny all other roles.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
