-- =============================================================================
-- student_phone_dedup — prevent duplicate students per class via phone number.
-- =============================================================================
-- Root cause: when a teacher manually adds a student AND the same student later
-- sends a join request from the app, accepting the request creates a second row
-- in the same class. The fix is:
--   1. Deduplicate any existing rows (keep whichever has an account link, else
--      keep the oldest row, then move its payment history across).
--   2. Add a partial unique index so the DB rejects future duplicates at the
--      INSERT level, before the edge-function logic even runs.
--
-- IMPORTANT: run Step 1 (cleanup) first and verify before Step 2 runs.
-- In practice the index creation will fail if duplicates still exist.
-- =============================================================================

-- ── Step 1: Clean up existing duplicates ─────────────────────────────────────
-- For each (class_id, student_phone) group with more than one live row:
--   • Keep the row that has a student_account_links entry (= the one the
--     student has already logged in with), breaking ties by oldest created_at.
--   • Move any payment_collections rows from the loser to the winner.
--   • Soft-delete the loser.

do $$
declare
  rec   record;
  winner_id   uuid;
  loser_id    uuid;
begin
  -- Find each duplicate group (phone not null, not deleted).
  for rec in
    select class_id, student_phone
    from public.students
    where student_phone is not null
      and deleted_at is null
    group by class_id, student_phone
    having count(*) > 1
  loop
    -- Pick the winner: prefer the one with an account link; break ties by age.
    select s.id into winner_id
    from public.students s
    left join public.student_account_links sal on sal.student_id = s.id
    where s.class_id = rec.class_id
      and s.student_phone = rec.student_phone
      and s.deleted_at is null
    order by (sal.id is not null) desc, s.created_at asc
    limit 1;

    -- Soft-delete all other rows in the group, re-pointing their payments first.
    for loser_id in
      select id from public.students
      where class_id = rec.class_id
        and student_phone = rec.student_phone
        and deleted_at is null
        and id <> winner_id
    loop
      -- Re-home payment_collections so history stays on the winner.
      update public.payment_collections
         set student_id = winner_id
       where student_id = loser_id;

      -- Soft-delete the duplicate.
      update public.students
         set deleted_at = now()
       where id = loser_id;

      raise notice 'Dedup: kept %, soft-deleted % (class %, phone %)',
        winner_id, loser_id, rec.class_id, rec.student_phone;
    end loop;
  end loop;
end;
$$;

-- ── Step 2: Enforce uniqueness going forward ──────────────────────────────────
-- Partial: only non-null phones in live rows.  NULL phone = unknown → no
-- constraint (so offline-created students without a phone don't block inserts).

create unique index if not exists students_class_phone_uniq
  on public.students (class_id, student_phone)
  where student_phone is not null and deleted_at is null;

comment on index public.students_class_phone_uniq is
  'One live student per phone per class. Prevents duplicates when a manually-added student later sends a join request from the portal.';
