-- Run once after call-sessions.sql. This upgrades calls without deleting history.
begin;

alter table public.call_sessions
  add column if not exists outcome text null,
  add column if not exists version bigint not null default 1,
  add column if not exists state_changed_at timestamptz not null default timezone('utc', now()),
  add column if not exists state_reason text not null default 'legacy_import',
  add column if not exists client_request_id uuid null;

-- Normalize legacy terminal statuses into lifecycle + outcome.
update public.call_sessions
set outcome = case
      when status = 'declined' then 'declined'
      when status = 'missed' then 'missed'
      else outcome
    end,
    status = case
      when status in ('declined', 'cancelled', 'missed') then 'ended'
      else status
    end,
    state_changed_at = updated_at,
    state_reason = case
      when status = 'declined' then 'recipient_declined'
      when status = 'missed' then 'ring_timeout'
      when status = 'cancelled' then 'caller_cancelled'
      when status = 'ended' then 'legacy_ended'
      when status = 'accepted' then 'recipient_accepted'
      else 'caller_started'
    end;

alter table public.call_sessions
  drop constraint if exists call_sessions_status_check;
alter table public.call_sessions
  add constraint call_sessions_status_check
    check (status in ('creating', 'ringing', 'accepted', 'ending', 'ended'));
alter table public.call_sessions
  drop constraint if exists call_sessions_outcome_check;
alter table public.call_sessions
  add constraint call_sessions_outcome_check
    check (outcome is null or outcome in ('declined', 'missed', 'unavailable', 'failed'));
alter table public.call_sessions
  drop constraint if exists call_sessions_terminal_shape_check;
alter table public.call_sessions
  add constraint call_sessions_terminal_shape_check
    check ((status = 'ended') or outcome is null);

create unique index if not exists call_sessions_start_idempotency_idx
  on public.call_sessions (caller_user_id, client_request_id)
  where client_request_id is not null;

create table if not exists public.call_participant_states (
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_state text not null,
  state_changed_at timestamptz not null default timezone('utc', now()),
  state_reason text not null,
  version bigint not null default 1,
  primary key (call_id, user_id),
  constraint call_participant_connection_state_check
    check (connection_state in ('accepting', 'connecting', 'connected', 'reconnecting', 'failed')),
  constraint call_participant_version_check check (version > 0)
);

create table if not exists public.call_state_events (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  previous_status text null,
  next_status text not null,
  previous_outcome text null,
  next_outcome text null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists call_state_events_call_created_idx
  on public.call_state_events (call_id, created_at, id);

alter table public.call_participant_states enable row level security;
alter table public.call_state_events enable row level security;
revoke all on table public.call_participant_states from anon, authenticated;
revoke all on table public.call_state_events from anon, authenticated;
grant select on table public.call_participant_states to authenticated;
grant select on table public.call_state_events to authenticated;

drop policy if exists "call_participant_states_select_participant" on public.call_participant_states;
create policy "call_participant_states_select_participant"
on public.call_participant_states for select to authenticated
using (exists (
  select 1 from public.call_sessions c
  where c.id = call_id and (select auth.uid()) in (c.caller_user_id, c.recipient_user_id)
));

drop policy if exists "call_state_events_select_participant" on public.call_state_events;
create policy "call_state_events_select_participant"
on public.call_state_events for select to authenticated
using (exists (
  select 1 from public.call_sessions c
  where c.id = call_id and (select auth.uid()) in (c.caller_user_id, c.recipient_user_id)
));

drop function if exists public.start_board_call(text, uuid, uuid, integer, integer);
create function public.start_board_call(
  p_board_id text,
  p_caller_user_id uuid,
  p_recipient_user_id uuid,
  p_client_request_id uuid,
  p_ring_seconds integer default 45,
  p_session_seconds integer default 86400
)
returns public.call_sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_call public.call_sessions;
  v_owner uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_caller_user_id is null or p_recipient_user_id is null
     or p_caller_user_id = p_recipient_user_id then
    raise exception 'CALL_SELF_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_client_request_id is null then
    raise exception 'CALL_INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_ring_seconds < 20 or p_ring_seconds > 120
     or p_session_seconds < 300 or p_session_seconds > 86400 then
    raise exception 'CALL_INVALID_EXPIRATION' using errcode = 'P0001';
  end if;

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
  if v_owner is null then raise exception 'CALL_BOARD_NOT_FOUND' using errcode = 'P0001'; end if;
  if not (p_caller_user_id = v_owner or exists (
    select 1 from public.board_shares where board_id = p_board_id
      and recipient_user_id = p_caller_user_id and status = 'accepted'
  )) or not (p_recipient_user_id = v_owner or exists (
    select 1 from public.board_shares where board_id = p_board_id
      and recipient_user_id = p_recipient_user_id and status = 'accepted'
  )) then raise exception 'CALL_FORBIDDEN' using errcode = 'P0001'; end if;

  if exists (select 1 from public.call_sessions
    where (caller_user_id in (p_caller_user_id, p_recipient_user_id)
       or recipient_user_id in (p_caller_user_id, p_recipient_user_id))
      and ((status in ('creating','ringing') and ring_expires_at > v_now)
        or (status in ('accepted','ending') and expires_at > v_now))) then
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
revoke all on function public.start_board_call(text, uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.start_board_call(text, uuid, uuid, uuid, integer, integer) to service_role;

drop function if exists public.transition_board_call(uuid, uuid, text);
create function public.transition_board_call(
  p_call_id uuid, p_user_id uuid, p_action text, p_reason text default null
)
returns public.call_sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c public.call_sessions;
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_outcome text;
  v_reason text;
  v_previous_status text;
  v_previous_outcome text;
begin
  select * into c from public.call_sessions where id = p_call_id for update;
  if c.id is null or p_user_id not in (c.caller_user_id, c.recipient_user_id) then
    raise exception 'CALL_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_previous_status := c.status;
  v_previous_outcome := c.outcome;

  -- Expiration is enforced on every transition, independently of cron.
  if c.status in ('creating','ringing') and c.ring_expires_at <= v_now then
    update public.call_sessions set status='ended', outcome='missed', ended_at=coalesce(ended_at,v_now),
      updated_at=v_now, state_changed_at=v_now, state_reason='ring_timeout', version=version+1
    where id=c.id returning * into c;
    insert into public.call_state_events(call_id,actor_user_id,previous_status,next_status,next_outcome,reason,created_at)
      values(c.id,null,v_previous_status,'ended','missed','ring_timeout',v_now);
  elsif c.status in ('accepted','ending') and c.expires_at <= v_now then
    update public.call_sessions set status='ended', ended_at=coalesce(ended_at,v_now),
      updated_at=v_now, state_changed_at=v_now, state_reason='session_expired', version=version+1
    where id=c.id returning * into c;
    insert into public.call_state_events(call_id,actor_user_id,previous_status,next_status,reason,created_at)
      values(c.id,null,v_previous_status,'ended','session_expired',v_now);
  end if;

  -- Same semantic action is a successful no-op.
  if (p_action='accept' and c.status='accepted')
    or (p_action='decline' and c.status='ended' and c.outcome='declined')
    or (p_action='cancel' and c.status='ended' and c.state_reason='caller_cancelled'
      and p_user_id=c.caller_user_id)
    or (p_action='begin-ending' and c.status='ending')
    or (p_action in ('begin-ending','end') and c.status='ended'
      and c.state_reason in ('local_hangup','peer_hung_up','hangup_requested'))
    or (p_action='report-unavailable' and c.status='ended' and c.outcome='unavailable')
    or (p_action='report-failed' and c.status='ended' and c.outcome='failed') then
    return c;
  end if;
  if c.status='ended' then raise exception 'CALL_TRANSITION_CONFLICT' using errcode='P0001'; end if;

  v_previous_status := c.status;
  v_previous_outcome := c.outcome;
  v_status := c.status; v_outcome := null;
  if p_action='accept' and p_user_id=c.recipient_user_id and c.status='ringing' then
    v_status:='accepted'; v_reason:='recipient_accepted';
  elsif p_action='decline' and p_user_id=c.recipient_user_id and c.status='ringing' then
    v_status:='ended'; v_outcome:='declined'; v_reason:='recipient_declined';
  elsif p_action='cancel' and p_user_id=c.caller_user_id and c.status in ('creating','ringing') then
    v_status:='ended'; v_reason:='caller_cancelled';
  elsif p_action='begin-ending' and c.status='accepted' then
    v_status:='ending'; v_reason:=coalesce(nullif(p_reason,''),'hangup_requested');
  elsif p_action='end' and c.status in ('accepted','ending') then
    v_status:='ended'; v_reason:=coalesce(nullif(p_reason,''),'peer_hung_up');
  elsif p_action='report-unavailable' and c.status in ('creating','ringing') then
    v_status:='ended'; v_outcome:='unavailable'; v_reason:='peer_unavailable';
  elsif p_action='report-failed' and c.status in ('accepted','ending') then
    v_status:='ended'; v_outcome:='failed'; v_reason:=coalesce(nullif(p_reason,''),'connection_failed');
  else raise exception 'CALL_TRANSITION_CONFLICT' using errcode='P0001';
  end if;

  update public.call_sessions set status=v_status, outcome=v_outcome,
    accepted_at=case when p_action='accept' then coalesce(accepted_at,v_now) else accepted_at end,
    declined_at=case when p_action='decline' then coalesce(declined_at,v_now) else declined_at end,
    ended_at=case when v_status='ended' then coalesce(ended_at,v_now) else ended_at end,
    ended_by_user_id=case when v_status='ended' then coalesce(ended_by_user_id,p_user_id) else ended_by_user_id end,
    updated_at=v_now, state_changed_at=v_now, state_reason=v_reason, version=version+1
  where id=c.id returning * into c;
  insert into public.call_state_events
    (call_id,actor_user_id,previous_status,next_status,previous_outcome,next_outcome,reason,created_at)
  values(c.id,p_user_id,v_previous_status,c.status,v_previous_outcome,c.outcome,v_reason,v_now);
  return c;
end;
$$;
revoke all on function public.transition_board_call(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_board_call(uuid, uuid, text, text) to service_role;

create or replace function public.update_call_participant_state(
  p_call_id uuid, p_user_id uuid, p_connection_state text,
  p_reason text, p_expected_version bigint default null
)
returns public.call_participant_states
language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.call_sessions; s public.call_participant_states; v_now timestamptz:=clock_timestamp();
begin
  select * into c from public.call_sessions where id=p_call_id for share;
  if c.id is null or p_user_id not in(c.caller_user_id,c.recipient_user_id) then
    raise exception 'CALL_NOT_FOUND' using errcode='P0001';
  end if;
  if not (c.status in('accepted','ending') or
      (c.status='ringing' and p_connection_state='accepting')) then
    raise exception 'CALL_TRANSITION_CONFLICT' using errcode='P0001';
  end if;
  if p_connection_state not in('accepting','connecting','connected','reconnecting','failed')
     or nullif(p_reason,'') is null then raise exception 'CALL_INVALID_PARTICIPANT_STATE' using errcode='P0001'; end if;
  select * into s from public.call_participant_states where call_id=p_call_id and user_id=p_user_id for update;
  if s.call_id is not null and s.connection_state=p_connection_state then return s; end if;
  if s.call_id is not null and p_expected_version is not null and s.version<>p_expected_version then
    raise exception 'CALL_VERSION_CONFLICT' using errcode='P0001';
  end if;
  if (s.call_id is null and not (
        (c.status='ringing' and p_connection_state='accepting') or
        (c.status in('accepted','ending') and p_connection_state in('connecting','connected','reconnecting','failed'))
      )) or
     (s.connection_state='accepting' and p_connection_state not in('connecting','failed')) or
     (s.connection_state='connecting' and p_connection_state not in('connected','reconnecting','failed')) or
     (s.connection_state='connected' and p_connection_state not in('reconnecting','failed')) or
     (s.connection_state='reconnecting' and p_connection_state not in('connected','failed')) or
     s.connection_state='failed' then
    raise exception 'CALL_TRANSITION_CONFLICT' using errcode='P0001';
  end if;
  insert into public.call_participant_states(call_id,user_id,connection_state,state_changed_at,state_reason,version)
  values(p_call_id,p_user_id,p_connection_state,v_now,p_reason,1)
  on conflict(call_id,user_id) do update set connection_state=excluded.connection_state,
    state_changed_at=excluded.state_changed_at,state_reason=excluded.state_reason,
    version=public.call_participant_states.version+1
  returning * into s;
  return s;
end;
$$;
revoke all on function public.update_call_participant_state(uuid,uuid,text,text,bigint) from public,anon,authenticated;
grant execute on function public.update_call_participant_state(uuid,uuid,text,text,bigint) to service_role;

create or replace function public.cleanup_expired_call_sessions()
returns integer language plpgsql security definer set search_path=public,pg_temp
as $$
declare affected integer; v_now timestamptz:=clock_timestamp();
begin
  with expired as (
    update public.call_sessions set status='ended',
      outcome=case when status in('creating','ringing') then 'missed' else outcome end,
      ended_at=coalesce(ended_at,v_now),updated_at=v_now,state_changed_at=v_now,
      state_reason=case when status in('creating','ringing') then 'ring_timeout' else 'session_expired' end,
      version=version+1
    where (status in('creating','ringing') and ring_expires_at<=v_now)
       or (status in('accepted','ending') and expires_at<=v_now)
    returning id,status,outcome,state_reason
  )
  insert into public.call_state_events(call_id,previous_status,next_status,next_outcome,reason,created_at)
    select id,case when outcome='missed' then 'ringing' else 'accepted' end,
      status,outcome,state_reason,v_now from expired;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.cleanup_expired_call_sessions() from public,anon,authenticated;
grant execute on function public.cleanup_expired_call_sessions() to service_role;

-- Update Realtime authorization for the upgraded active lifecycle.
drop policy if exists "scriboo_call_topics_read" on realtime.messages;
create policy "scriboo_call_topics_read" on realtime.messages for select to authenticated
using (realtime.messages.extension in('broadcast','presence') and (
  (select realtime.topic())='user:'||(select auth.uid())::text||':calls' or exists(
    select 1 from public.call_sessions c where 'call:'||c.id::text=(select realtime.topic())
      and (select auth.uid()) in(c.caller_user_id,c.recipient_user_id)
      and ((c.status in('creating','ringing') and c.ring_expires_at>clock_timestamp())
        or (c.status in('accepted','ending') and c.expires_at>clock_timestamp()))
  )));
drop policy if exists "scriboo_call_topics_write" on realtime.messages;
create policy "scriboo_call_topics_write" on realtime.messages for insert to authenticated
with check (realtime.messages.extension in('broadcast','presence') and (
  (select realtime.topic())='user:'||(select auth.uid())::text||':calls' or exists(
    select 1 from public.call_sessions c where 'call:'||c.id::text=(select realtime.topic())
      and (select auth.uid()) in(c.caller_user_id,c.recipient_user_id)
      and ((c.status in('creating','ringing') and c.ring_expires_at>clock_timestamp())
        or (c.status in('accepted','ending') and c.expires_at>clock_timestamp()))
  )));

notify pgrst, 'reload schema';
commit;

-- Also schedule in Supabase Cron: select public.cleanup_expired_call_sessions(); every minute.
