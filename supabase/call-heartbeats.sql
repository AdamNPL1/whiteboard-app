-- Run once after call-state-machine.sql. Safe to run again.
-- Accepted calls are renewable leases: both participants must report presence.
begin;

alter table public.call_sessions
  add column if not exists caller_last_seen_at timestamptz null,
  add column if not exists recipient_last_seen_at timestamptz null;

create index if not exists call_sessions_accepted_heartbeat_idx
  on public.call_sessions (status, caller_last_seen_at, recipient_last_seen_at)
  where status in ('accepted', 'ending');

-- Remove the pre-state-machine heartbeat helpers if an earlier version of this
-- migration was applied.
drop function if exists public.start_board_call_v2(text, uuid, uuid, integer, integer, integer);
drop function if exists public.finish_board_call(uuid, uuid);

create or replace function public.start_board_call_with_heartbeat(
  p_board_id text,
  p_caller_user_id uuid,
  p_recipient_user_id uuid,
  p_client_request_id uuid,
  p_ring_seconds integer default 45,
  p_session_seconds integer default 86400,
  p_stale_seconds integer default 60
)
returns public.call_sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_call public.call_sessions;
  v_stale public.call_sessions;
  v_owner uuid;
  v_now timestamptz := clock_timestamp();
  v_stale_before timestamptz;
begin
  if p_caller_user_id is null or p_recipient_user_id is null
     or p_caller_user_id = p_recipient_user_id then
    raise exception 'CALL_SELF_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_client_request_id is null then
    raise exception 'CALL_INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_ring_seconds < 20 or p_ring_seconds > 120
     or p_session_seconds < 300 or p_session_seconds > 86400
     or p_stale_seconds < 30 or p_stale_seconds > 300 then
    raise exception 'CALL_INVALID_EXPIRATION' using errcode = 'P0001';
  end if;
  v_stale_before := v_now - make_interval(secs => p_stale_seconds);

  perform pg_advisory_xact_lock(hashtextextended(least(p_caller_user_id::text, p_recipient_user_id::text), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(p_caller_user_id::text, p_recipient_user_id::text), 0));

  select * into v_call from public.call_sessions
  where caller_user_id = p_caller_user_id and client_request_id = p_client_request_id;
  if v_call.id is not null then
    if v_call.board_id <> p_board_id or v_call.recipient_user_id <> p_recipient_user_id then
      raise exception 'CALL_IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return v_call;
  end if;

  select user_id into v_owner from public.boards
  where id = p_board_id and deleted_at is null;
  if v_owner is null then
    raise exception 'CALL_BOARD_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (p_caller_user_id = v_owner or exists (
    select 1 from public.board_shares where board_id = p_board_id
      and recipient_user_id = p_caller_user_id and status = 'accepted'
  )) or not (p_recipient_user_id = v_owner or exists (
    select 1 from public.board_shares where board_id = p_board_id
      and recipient_user_id = p_recipient_user_id and status = 'accepted'
  )) then
    raise exception 'CALL_FORBIDDEN' using errcode = 'P0001';
  end if;

  -- Reclaim abandoned calls under the same participant locks used to create a
  -- call, making stale recovery and the busy decision atomic.
  for v_stale in
    select * from public.call_sessions
    where status in ('accepted', 'ending')
      and (caller_user_id in (p_caller_user_id, p_recipient_user_id)
        or recipient_user_id in (p_caller_user_id, p_recipient_user_id))
      and (expires_at <= v_now
        or coalesce(caller_last_seen_at, accepted_at, updated_at) < v_stale_before
        or coalesce(recipient_last_seen_at, accepted_at, updated_at) < v_stale_before)
    for update
  loop
    update public.call_sessions set
      status = 'ended',
      outcome = case when v_stale.status = 'accepted' then 'failed' else null end,
      ended_at = coalesce(ended_at, v_now), updated_at = v_now,
      state_changed_at = v_now,
      state_reason = case when v_stale.status = 'ending' then 'hangup_timeout' else 'heartbeat_timeout' end,
      version = version + 1
    where id = v_stale.id;
    insert into public.call_state_events(
      call_id, previous_status, next_status, previous_outcome, next_outcome, reason, created_at
    ) values (
      v_stale.id, v_stale.status, 'ended', v_stale.outcome,
      case when v_stale.status = 'accepted' then 'failed' else null end,
      case when v_stale.status = 'ending' then 'hangup_timeout' else 'heartbeat_timeout' end,
      v_now
    );
  end loop;

  if exists (select 1 from public.call_sessions
    where (caller_user_id in (p_caller_user_id, p_recipient_user_id)
       or recipient_user_id in (p_caller_user_id, p_recipient_user_id))
      and ((status in ('creating','ringing') and ring_expires_at > v_now)
        or status in ('accepted','ending'))) then
    raise exception 'CALL_PARTICIPANT_BUSY' using errcode = 'P0001';
  end if;

  insert into public.call_sessions (
    board_id, caller_user_id, recipient_user_id, status, outcome,
    created_at, updated_at, ring_expires_at, expires_at,
    state_changed_at, state_reason, client_request_id
  ) values (
    p_board_id, p_caller_user_id, p_recipient_user_id, 'ringing', null,
    v_now, v_now, v_now + make_interval(secs => p_ring_seconds),
    v_now + make_interval(secs => p_session_seconds), v_now, 'caller_started', p_client_request_id
  ) returning * into v_call;

  insert into public.call_state_events
    (call_id, actor_user_id, previous_status, next_status, reason, created_at)
  values
    (v_call.id, p_caller_user_id, null, 'creating', 'create_requested', v_now),
    (v_call.id, p_caller_user_id, 'creating', 'ringing', 'caller_started', v_now);
  return v_call;
end;
$$;
revoke all on function public.start_board_call_with_heartbeat(text, uuid, uuid, uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.start_board_call_with_heartbeat(text, uuid, uuid, uuid, integer, integer, integer)
  to service_role;

create or replace function public.heartbeat_board_call(p_call_id uuid, p_user_id uuid)
returns public.call_sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.call_sessions; v_now timestamptz := clock_timestamp();
begin
  select * into c from public.call_sessions where id = p_call_id for update;
  if c.id is null or p_user_id not in (c.caller_user_id, c.recipient_user_id) then
    raise exception 'CALL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if c.status not in ('accepted', 'ending') then
    raise exception 'CALL_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  update public.call_sessions set
    caller_last_seen_at = case when p_user_id = caller_user_id then v_now else caller_last_seen_at end,
    recipient_last_seen_at = case when p_user_id = recipient_user_id then v_now else recipient_last_seen_at end,
    expires_at = greatest(expires_at, v_now + interval '24 hours'), updated_at = v_now
  where id = p_call_id returning * into c;
  return c;
end;
$$;
revoke all on function public.heartbeat_board_call(uuid, uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_board_call(uuid, uuid) to service_role;

create or replace function public.cleanup_expired_call_sessions()
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.call_sessions;
  affected integer := 0;
  v_now timestamptz := clock_timestamp();
  v_stale_before timestamptz := clock_timestamp() - interval '60 seconds';
  v_outcome text;
  v_reason text;
begin
  for c in
    select * from public.call_sessions
    where (status in ('creating','ringing') and ring_expires_at <= v_now)
       or (status in ('accepted','ending') and (
         expires_at <= v_now
         or coalesce(caller_last_seen_at, accepted_at, updated_at) < v_stale_before
         or coalesce(recipient_last_seen_at, accepted_at, updated_at) < v_stale_before))
    for update skip locked
  loop
    v_outcome := case
      when c.status in ('creating','ringing') then 'missed'
      when c.status = 'accepted' then 'failed'
      else null
    end;
    v_reason := case
      when c.status in ('creating','ringing') then 'ring_timeout'
      when c.status = 'ending' then 'hangup_timeout'
      when c.expires_at <= v_now then 'session_expired'
      else 'heartbeat_timeout'
    end;
    update public.call_sessions set
      status = 'ended', outcome = v_outcome,
      ended_at = coalesce(ended_at, v_now), updated_at = v_now,
      state_changed_at = v_now, state_reason = v_reason, version = version + 1
    where id = c.id;
    insert into public.call_state_events(
      call_id, previous_status, next_status, previous_outcome, next_outcome, reason, created_at
    ) values (c.id, c.status, 'ended', c.outcome, v_outcome, v_reason, v_now);
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;
revoke all on function public.cleanup_expired_call_sessions() from public, anon, authenticated;
grant execute on function public.cleanup_expired_call_sessions() to service_role;

notify pgrst, 'reload schema';
commit;

-- Schedule in Supabase Cron every minute:
-- select public.cleanup_expired_call_sessions();
