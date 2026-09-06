-- Monitoring RPCs for U13: R2 storage usage + SMS usage summary

-- Per-teacher R2 storage usage (aggregated from note_files)
create or replace function public.get_storage_usage()
returns table(
  teacher_id   uuid,
  username     citext,
  name         text,
  file_count   bigint,
  total_bytes  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    t.id                          as teacher_id,
    t.username,
    t.name,
    count(nf.id)::bigint          as file_count,
    coalesce(sum(nf.size_bytes), 0)::bigint as total_bytes
  from public.teachers t
  left join public.note_files nf
    on nf.teacher_id = t.id and nf.deleted_at is null
  where t.deleted_at is null
  group by t.id, t.username, t.name
  order by total_bytes desc;
end;
$$;

revoke all on function public.get_storage_usage() from public;
grant execute on function public.get_storage_usage() to authenticated;

-- SMS usage summary per teacher (last 30 days)
create or replace function public.get_sms_usage(days_back int default 30)
returns table(
  teacher_id uuid,
  username   citext,
  name       text,
  sent       bigint,
  failed     bigint,
  queued     bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    t.id                                                          as teacher_id,
    t.username,
    t.name,
    count(*) filter (where m.status = 'sent')::bigint             as sent,
    count(*) filter (where m.status = 'failed')::bigint           as failed,
    count(*) filter (where m.status = 'queued')::bigint           as queued
  from public.teachers t
  left join public.messages m
    on  m.teacher_id = t.id
    and m.channel = 'sms'
    and m.created_at >= now() - (days_back * interval '1 day')
  where t.deleted_at is null
  group by t.id, t.username, t.name
  order by sent desc;
end;
$$;

revoke all on function public.get_sms_usage(int) from public;
grant execute on function public.get_sms_usage(int) to authenticated;
