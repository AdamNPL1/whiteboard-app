-- Run once after call-heartbeats.sql. Safe to run again.
begin;

create table if not exists public.call_device_ownership (
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  user_id uuid not null,
  session_id uuid not null,
  claimed_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (call_id, user_id)
);

alter table public.call_device_ownership enable row level security;
revoke all on table public.call_device_ownership from public, anon, authenticated;

create index if not exists call_device_ownership_last_seen_idx
  on public.call_device_ownership(last_seen_at);

create or replace function public.claim_call_device_session(
  p_call_id uuid, p_user_id uuid, p_session_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.call_sessions; owner_row public.call_device_ownership; v_now timestamptz := clock_timestamp();
begin
  select * into c from public.call_sessions where id = p_call_id for update;
  if c.id is null or p_user_id not in (c.caller_user_id, c.recipient_user_id)
     or c.status not in ('creating','ringing','accepted','ending') then
    raise exception 'CALL_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  select * into owner_row from public.call_device_ownership
    where call_id = p_call_id and user_id = p_user_id for update;
  if owner_row.call_id is null then
    insert into public.call_device_ownership(call_id,user_id,session_id,claimed_at,last_seen_at)
      values(p_call_id,p_user_id,p_session_id,v_now,v_now);
    return true;
  end if;
  if owner_row.session_id = p_session_id then
    update public.call_device_ownership set last_seen_at = v_now
      where call_id = p_call_id and user_id = p_user_id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.heartbeat_call_device_session(
  p_call_id uuid, p_user_id uuid, p_session_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.call_device_ownership set last_seen_at = clock_timestamp()
    where call_id = p_call_id and user_id = p_user_id and session_id = p_session_id;
  return found;
end;
$$;

revoke all on function public.claim_call_device_session(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_call_device_session(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_call_device_session(uuid,uuid,uuid) to service_role;
grant execute on function public.heartbeat_call_device_session(uuid,uuid,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
