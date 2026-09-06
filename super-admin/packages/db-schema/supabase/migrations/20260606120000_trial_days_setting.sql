-- =============================================================================
-- trial_days — configurable default free-trial length (in days) for new teacher
-- sign-ups. Normally 14, but the super-admin can change it for a season (e.g. a
-- promo giving new joiners 30 days). Read by register_teacher_confirm when it
-- creates the trial subscription. Existing teachers keep their own
-- current_period_end — changing this only affects teachers who sign up afterwards.
-- =============================================================================

INSERT INTO app_settings (key, value)
  VALUES ('trial_days', '14')
  ON CONFLICT (key) DO NOTHING;
