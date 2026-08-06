-- Run once in the Supabase SQL Editor after board-shares.sql and boards.sql.
-- This migration creates the durable authorization boundary for one-to-one
-- board calls. SDP, ICE candidates, TURN credentials, and audio are never
-- stored in this table.

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards (id) on delete cascade,
  caller_user_id uuid not null references auth.users (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'ringing',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  ring_expires_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  declined_at timestamptz null,
  ended_at timestamptz null,
  ended_by_user_id uuid null references auth.users (id) on delete set null,
  constraint call_sessions_distinct_participants_check
    check (caller_user_id <> recipient_user_id),
  constraint call_sessions_status_check
    check (status in ('ringing', 'accepted', 'declined', 'cancelled', 'missed', 'ended')),
  constraint call_sessions_expiration_check
    check (ring_expires_at > created_at and expires_at > ring_expires_at)
);

create index if not exists call_sessions_caller_active_idx
  on public.call_sessions (caller_user_id, status, expires_at desc);
create index if not exists call_sessions_recipient_active_idx
  on public.call_sessions (recipient_user_id, status, expires_at desc);
create index if not exists call_sessions_board_created_idx
  on public.call_sessions (board_id, created_at desc);
create index if not exists call_sessions_cleanup_idx
  on public.call_sessions (status, ring_expires_at, expires_at);

alter table public.call_sessions enable row level security;

drop policy if exists "call_sessions_select_participant" on public.call_sessions;
create policy "call_sessions_select_participant"
on public.call_sessions
for select
to authenticated
using (
  (select auth.uid()) = caller_user_id
  or (select auth.uid()) = recipient_user_id
);

-- Call mutations are server-owned. A browser cannot forge a caller, recipient,
-- acceptance, or terminal state even if it knows a call UUID.
revoke all on table public.call_sessions from anon, authenticated;
grant select on table public.call_sessions to authenticated;

create or replace function public.start_board_call(
  p_board_id text,
  p_caller_user_id uuid,
  p_recipient_user_id uuid,
  p_ring_seconds integer default 60,
  p_session_seconds integer default 86400
)
returns public.call_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_call public.call_sessions;
  board_owner_id uuid;
  caller_has_access boolean;
  recipient_has_access boolean;
  v_now timestamptz := clock_timestamp();
begin
  if p_caller_user_id is null
    or p_recipient_user_id is null
    or p_caller_user_id = p_recipient_user_id then
    raise exception 'CALL_SELF_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if p_ring_seconds < 20 or p_ring_seconds > 120
    or p_session_seconds < 300 or p_session_seconds > 86400 then
    raise exception 'CALL_INVALID_EXPIRATION' using errcode = 'P0001';
  end if;

  -- Lock both user identities in a stable order so two concurrent requests
  -- cannot place either participant into multiple active calls.
  perform pg_advisory_xact_lock(
    hashtextextended(least(p_caller_user_id::text, p_recipient_user_id::text), 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(greatest(p_caller_user_id::text, p_recipient_user_id::text), 0)
  );

  select boards.user_id
  into board_owner_id
  from public.boards
  where boards.id = p_board_id
    and boards.deleted_at is null;

  if board_owner_id is null then
    raise exception 'CALL_BOARD_NOT_FOUND' using errcode = 'P0001';
  end if;

  caller_has_access := p_caller_user_id = board_owner_id or exists (
    select 1
    from public.board_shares
    where board_shares.board_id = p_board_id
      and board_shares.recipient_user_id = p_caller_user_id
      and board_shares.status = 'accepted'
  );
  recipient_has_access := p_recipient_user_id = board_owner_id or exists (
    select 1
    from public.board_shares
    where board_shares.board_id = p_board_id
      and board_shares.recipient_user_id = p_recipient_user_id
      and board_shares.status = 'accepted'
  );

  if not caller_has_access or not recipient_has_access then
    raise exception 'CALL_FORBIDDEN' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.call_sessions
    where (
      caller_user_id in (p_caller_user_id, p_recipient_user_id)
      or recipient_user_id in (p_caller_user_id, p_recipient_user_id)
    )
    and (
      (status = 'ringing' and ring_expires_at > v_now)
      or (status = 'accepted' and expires_at > v_now)
    )
  ) then
    raise exception 'CALL_PARTICIPANT_BUSY' using errcode = 'P0001';
  end if;

  insert into public.call_sessions (
    board_id,
    caller_user_id,
    recipient_user_id,
    status,
    created_at,
    updated_at,
    ring_expires_at,
    expires_at
  ) values (
    p_board_id,
    p_caller_user_id,
    p_recipient_user_id,
    'ringing',
    v_now,
    v_now,
    v_now + make_interval(secs => p_ring_seconds),
    v_now + make_interval(secs => p_session_seconds)
  )
  returning * into created_call;

  return created_call;
end;
$$;

revoke all on function public.start_board_call(text, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.start_board_call(text, uuid, uuid, integer, integer)
  to service_role;

create or replace function public.transition_board_call(
  p_call_id uuid,
  p_user_id uuid,
  p_action text
)
returns public.call_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_call public.call_sessions;
  changed_call public.call_sessions;
  v_now timestamptz := clock_timestamp();
begin
  select * into current_call
  from public.call_sessions
  where id = p_call_id
  for update;

  if current_call.id is null
    or p_user_id not in (current_call.caller_user_id, current_call.recipient_user_id) then
    raise exception 'CALL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_action = 'accept' then
    if p_user_id <> current_call.recipient_user_id
      or current_call.status <> 'ringing'
      or current_call.ring_expires_at <= v_now then
      raise exception 'CALL_CANNOT_ACCEPT' using errcode = 'P0001';
    end if;

    update public.call_sessions
    set status = 'accepted', accepted_at = v_now, updated_at = v_now
    where id = p_call_id
    returning * into changed_call;
  elsif p_action = 'decline' then
    if p_user_id <> current_call.recipient_user_id
      or current_call.status <> 'ringing'
      or current_call.ring_expires_at <= v_now then
      raise exception 'CALL_CANNOT_DECLINE' using errcode = 'P0001';
    end if;

    update public.call_sessions
    set status = 'declined', declined_at = v_now,
        ended_at = v_now, ended_by_user_id = p_user_id,
        updated_at = v_now
    where id = p_call_id
    returning * into changed_call;
  elsif p_action = 'cancel' then
    if p_user_id <> current_call.caller_user_id or current_call.status <> 'ringing' then
      raise exception 'CALL_CANNOT_CANCEL' using errcode = 'P0001';
    end if;

    update public.call_sessions
    set status = 'cancelled', ended_at = v_now,
        ended_by_user_id = p_user_id, updated_at = v_now
    where id = p_call_id
    returning * into changed_call;
  elsif p_action = 'end' then
    if current_call.status <> 'accepted' then
      raise exception 'CALL_CANNOT_END' using errcode = 'P0001';
    end if;

    update public.call_sessions
    set status = 'ended', ended_at = v_now,
        ended_by_user_id = p_user_id, updated_at = v_now
    where id = p_call_id
    returning * into changed_call;
  else
    raise exception 'CALL_INVALID_ACTION' using errcode = 'P0001';
  end if;

  return changed_call;
end;
$$;

revoke all on function public.transition_board_call(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_board_call(uuid, uuid, text)
  to service_role;

create or replace function public.cleanup_expired_call_sessions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_rows integer;
begin
  update public.call_sessions
  set
    status = case when status = 'ringing' then 'missed' else 'ended' end,
    ended_at = coalesce(ended_at, clock_timestamp()),
    updated_at = clock_timestamp()
  where (status = 'ringing' and ring_expires_at <= clock_timestamp())
     or (status = 'accepted' and expires_at <= clock_timestamp());

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.cleanup_expired_call_sessions()
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_call_sessions()
  to service_role;

-- Deliver an incoming-call event even when the recipient is viewing a
-- different board. The payload contains identifiers only; the recipient then
-- loads the authorized call and board context through Scriboo's API.
create or replace function public.notify_incoming_board_call()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'callId', new.id::text,
      'boardId', new.board_id,
      'callerUserId', new.caller_user_id::text,
      'createdAt', new.created_at
    ),
    'incoming-call',
    'user:' || new.recipient_user_id::text || ':calls',
    true
  );
  return new;
end;
$$;

revoke all on function public.notify_incoming_board_call()
  from public, anon, authenticated;

drop trigger if exists notify_incoming_board_call_trigger on public.call_sessions;
create trigger notify_incoming_board_call_trigger
after insert on public.call_sessions
for each row execute function public.notify_incoming_board_call();

-- Private Realtime topics:
--   user:<authenticated-user-id>:calls   incoming call notifications
--   call:<call-session-id>               one-to-one signaling and presence
drop policy if exists "scriboo_call_topics_read" on realtime.messages;
create policy "scriboo_call_topics_read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and (
    (select realtime.topic()) = 'user:' || (select auth.uid())::text || ':calls'
    or exists (
      select 1
      from public.call_sessions
      where 'call:' || call_sessions.id::text = (select realtime.topic())
        and (select auth.uid()) in (
          call_sessions.caller_user_id,
          call_sessions.recipient_user_id
        )
        and (
          (call_sessions.status = 'ringing'
            and call_sessions.ring_expires_at > clock_timestamp())
          or (call_sessions.status = 'accepted'
            and call_sessions.expires_at > clock_timestamp())
        )
    )
  )
);

drop policy if exists "scriboo_call_topics_write" on realtime.messages;
create policy "scriboo_call_topics_write"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (
    (select realtime.topic()) = 'user:' || (select auth.uid())::text || ':calls'
    or exists (
      select 1
      from public.call_sessions
      where 'call:' || call_sessions.id::text = (select realtime.topic())
        and (select auth.uid()) in (
          call_sessions.caller_user_id,
          call_sessions.recipient_user_id
        )
        and (
          (call_sessions.status = 'ringing'
            and call_sessions.ring_expires_at > clock_timestamp())
          or (call_sessions.status = 'accepted'
            and call_sessions.expires_at > clock_timestamp())
        )
    )
  )
);

notify pgrst, 'reload schema';

-- Schedule public.cleanup_expired_call_sessions() once per minute with
-- Supabase Cron before launch, or invoke it from a protected scheduled route.
