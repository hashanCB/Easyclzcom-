-- Drop tables from the old class-code login system.
-- Replaced by the global student account system (student_accounts + student_account_links).

DROP TABLE IF EXISTS student_invite_tokens;
DROP TABLE IF EXISTS student_credentials;
