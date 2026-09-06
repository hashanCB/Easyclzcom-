-- Normalise all student phone numbers to local Sri Lanka format (07XXXXXXXXX).
-- Some accounts were registered/updated with international +94XXXXXXXXX format.
-- All edge functions now consistently store and query using the 07... format.

UPDATE student_accounts
SET phone = '0' || substring(phone FROM 4)   -- strips '+94' → prepends '0'
WHERE phone LIKE '+94%' AND length(phone) = 12;  -- exactly +94 + 9 digits
