-- =============================================================================
-- 20260612120000_regenerate_class_code.sql
-- Let a teacher regenerate their class's join code (e.g. if it leaked to
-- students who shouldn't have it). Old code stops working immediately —
-- pending join requests are unaffected since they reference class_id.
-- =============================================================================

create or replace function public.regenerate_class_join_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  -- Only the owning teacher (or a super admin) may rotate the code.
  if not exists (
    select 1 from public.classes
     where id = p_class_id
       and (teacher_id = auth.uid() or public.is_super_admin())
  ) then
    raise exception 'not allowed';
  end if;

  new_code := public.generate_class_join_code();
  update public.classes set join_code = new_code where id = p_class_id;
  return new_code;
end;
$$;

revoke all on function public.regenerate_class_join_code(uuid) from public;
grant execute on function public.regenerate_class_join_code(uuid) to authenticated;
