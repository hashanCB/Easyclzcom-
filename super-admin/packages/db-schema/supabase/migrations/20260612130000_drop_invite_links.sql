-- =============================================================================
-- 20260612130000_drop_invite_links.sql
-- Remove the old per-class invite-link flow. The class join code
-- (classes.join_code + class_join_requests) fully replaces it, and the app
-- has not launched publicly, so no old clients depend on this.
-- =============================================================================

drop table if exists public.class_invite_tokens;
