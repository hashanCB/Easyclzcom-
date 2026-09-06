-- =============================================================================
-- Auto-resolve a pending class join request when the same student is added to
-- that class by any other path (assistant manual add at the door, teacher manual
-- add, or QR scan). Identity is the phone number — the same key the rest of the
-- app uses for student dedup.
--
-- Without this, a student who sent a code-based join request and was then added
-- in person leaves a stale "pending" card in the teacher's Join Requests list
-- for someone who is already in the class.
-- =============================================================================

create or replace function public.resolve_join_request_on_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone   text;
  v_request record;
begin
  -- Only meaningful for a live student row that carries a phone number.
  if NEW.student_phone is null or NEW.deleted_at is not null then
    return NEW;
  end if;
  v_phone := regexp_replace(NEW.student_phone, '\D', '', 'g');
  if length(v_phone) < 7 then
    return NEW;
  end if;

  -- Link the requesting account to this student record (phone = same person),
  -- but only if this student isn't already claimed by some account. Take the
  -- oldest matching pending request as the account to adopt.
  if not exists (select 1 from student_account_links l where l.student_id = NEW.id) then
    select r.student_account_id, r.teacher_id
      into v_request
    from class_join_requests r
    where r.class_id = NEW.class_id
      and r.status = 'pending'
      and regexp_replace(coalesce(r.student_phone, ''), '\D', '', 'g') = v_phone
    order by r.created_at asc
    limit 1;

    if found then
      insert into student_account_links (student_account_id, teacher_id, student_id)
      values (v_request.student_account_id, v_request.teacher_id, NEW.id)
      on conflict (student_account_id, student_id) do nothing;
    end if;
  end if;

  -- Clear every matching pending request for this class — the student is now in.
  update class_join_requests r
  set status = 'accepted',
      student_id = NEW.id,
      decided_at = now()
  where r.class_id = NEW.class_id
    and r.status = 'pending'
    and regexp_replace(coalesce(r.student_phone, ''), '\D', '', 'g') = v_phone;

  return NEW;
end;
$$;

drop trigger if exists students_resolve_join_request on public.students;
create trigger students_resolve_join_request
  after insert on public.students
  for each row
  execute function public.resolve_join_request_on_student();

-- ── One-time cleanup of already-stale pending requests ──────────────────────
-- Any pending request whose phone matches a live student already in that class
-- is resolved now (and the account linked if the student is unclaimed).

do $$
declare
  r record;
begin
  for r in
    select req.id          as request_id,
           req.student_account_id,
           req.teacher_id,
           s.id             as student_id
    from class_join_requests req
    join students s
      on s.class_id = req.class_id
     and s.deleted_at is null
     and s.is_active is not false
     and regexp_replace(coalesce(s.student_phone, ''), '\D', '', 'g')
       = regexp_replace(coalesce(req.student_phone, ''), '\D', '', 'g')
     and length(regexp_replace(coalesce(req.student_phone, ''), '\D', '', 'g')) >= 7
    where req.status = 'pending'
  loop
    if not exists (select 1 from student_account_links l where l.student_id = r.student_id) then
      insert into student_account_links (student_account_id, teacher_id, student_id)
      values (r.student_account_id, r.teacher_id, r.student_id)
      on conflict (student_account_id, student_id) do nothing;
    end if;

    update class_join_requests
    set status = 'accepted', student_id = r.student_id, decided_at = now()
    where id = r.request_id and status = 'pending';
  end loop;
end;
$$;
