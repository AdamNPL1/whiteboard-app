-- Number 17: call privacy, revocation and retention hardening.
-- Apply once in the Supabase SQL Editor after the existing call migrations.

-- End calls before access disappears so connected clients receive a terminal
-- state instead of retaining a stale media/signaling session.
create or replace function public.end_calls_when_board_access_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_board_id text;
  v_user_id uuid;
begin
  v_board_id := old.board_id;
  v_user_id := old.recipient_user_id;

  if tg_op = 'UPDATE'
     and old.status = 'accepted'
     and new.status = 'accepted'
     and old.recipient_user_id is not distinct from new.recipient_user_id then
    return new;
  end if;

  if v_user_id is not null then
    update public.call_sessions
    set status = 'ended',
        outcome = 'unavailable',
        ended_at = coalesce(ended_at, v_now),
        updated_at = v_now,
        state_changed_at = v_now,
        state_reason = 'board_access_revoked',
        version = version + 1
    where board_id = v_board_id
      and status in ('creating', 'ringing', 'accepted', 'ending')
      and (caller_user_id = v_user_id or recipient_user_id = v_user_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.end_calls_when_board_access_changes()
from public, anon, authenticated;

drop trigger if exists end_calls_before_board_share_revocation on public.board_shares;
create trigger end_calls_before_board_share_revocation
before delete or update of status, recipient_user_id on public.board_shares
for each row execute function public.end_calls_when_board_access_changes();

create or replace function public.end_calls_when_board_closes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if tg_op = 'DELETE' or (old.deleted_at is null and new.deleted_at is not null) then
    update public.call_sessions
    set status = 'ended',
        outcome = 'unavailable',
        ended_at = coalesce(ended_at, v_now),
        updated_at = v_now,
        state_changed_at = v_now,
        state_reason = 'board_closed',
        version = version + 1
    where board_id = old.id
      and status in ('creating', 'ringing', 'accepted', 'ending');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.end_calls_when_board_closes()
from public, anon, authenticated;

drop trigger if exists end_calls_before_board_close on public.boards;
create trigger end_calls_before_board_close
before delete or update of deleted_at on public.boards
for each row execute function public.end_calls_when_board_closes();

-- Retain ordinary call history for 30 days and failed/cancelled negotiation
-- payloads only until their short expiry. No TURN secret, media, ICE candidate,
-- or client IP is stored by these tables.
create or replace function public.cleanup_private_call_data()
returns table(deleted_signals bigint, deleted_calls bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signals bigint := 0;
  v_calls bigint := 0;
begin
  delete from public.call_signal_messages
  where expires_at <= clock_timestamp();
  get diagnostics v_signals = row_count;

  delete from public.call_sessions
  where status = 'ended'
    and coalesce(ended_at, updated_at, created_at)
      < clock_timestamp() - interval '30 days';
  get diagnostics v_calls = row_count;

  return query select v_signals, v_calls;
end;
$$;

revoke all on function public.cleanup_private_call_data()
from public, anon, authenticated;
grant execute on function public.cleanup_private_call_data() to service_role;

-- Run with Supabase Cron once daily:
-- select public.cleanup_private_call_data();
