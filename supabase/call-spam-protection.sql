-- Number 18: recipient-controlled blocking, DND enforcement and call cooldowns.
-- Apply after call-state-machine.sql and call-push-notifications.sql.
begin;

create table if not exists public.call_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker_user_id, blocked_user_id),
  constraint call_blocks_no_self check (blocker_user_id <> blocked_user_id)
);
alter table public.call_blocks enable row level security;
revoke all on table public.call_blocks from public, anon, authenticated;

create table if not exists public.call_abuse_events (
  id bigint generated always as identity primary key,
  caller_user_id uuid null references auth.users(id) on delete set null,
  recipient_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('blocked','dnd','cooldown','rate_limited')),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists call_abuse_events_created_idx on public.call_abuse_events(created_at);
create index if not exists call_abuse_events_caller_idx on public.call_abuse_events(caller_user_id,created_at desc);
alter table public.call_abuse_events enable row level security;
revoke all on table public.call_abuse_events from public, anon, authenticated;

create or replace function public.check_call_contact_permission(
  p_caller_user_id uuid,
  p_recipient_user_id uuid
)
returns table(allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_last_attempt timestamptz;
  v_declines integer := 0;
  v_cooldown_seconds integer := 0;
  v_elapsed integer := 0;
begin
  if exists (
    select 1 from public.call_blocks
    where blocker_user_id = p_recipient_user_id and blocked_user_id = p_caller_user_id
  ) then
    insert into public.call_abuse_events(caller_user_id,recipient_user_id,event_type)
    values(p_caller_user_id,p_recipient_user_id,'blocked');
    return query select false, 'unavailable'::text, 0;
    return;
  end if;

  if exists (
    select 1 from public.call_notification_preferences
    where user_id = p_recipient_user_id and dnd_until > v_now
  ) then
    insert into public.call_abuse_events(caller_user_id,recipient_user_id,event_type)
    values(p_caller_user_id,p_recipient_user_id,'dnd');
    return query select false, 'unavailable'::text, 0;
    return;
  end if;

  select max(created_at), count(*) filter (where outcome = 'declined')::integer
  into v_last_attempt, v_declines
  from public.call_sessions
  where caller_user_id = p_caller_user_id
    and recipient_user_id = p_recipient_user_id
    and created_at > v_now - interval '24 hours';

  if v_last_attempt is not null then
    v_cooldown_seconds := case
      when v_declines >= 3 then 1800
      when v_declines >= 1 then 120
      else 30
    end;
    v_elapsed := greatest(0, extract(epoch from (v_now - v_last_attempt))::integer);
    if v_elapsed < v_cooldown_seconds then
      insert into public.call_abuse_events(caller_user_id,recipient_user_id,event_type)
      values(p_caller_user_id,p_recipient_user_id,'cooldown');
      return query select false, 'cooldown'::text, v_cooldown_seconds - v_elapsed;
      return;
    end if;
  end if;
  return query select true, 'allowed'::text, 0;
end;
$$;
revoke all on function public.check_call_contact_permission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.check_call_contact_permission(uuid,uuid) to service_role;

create or replace function public.block_call_participant(p_blocker_user_id uuid,p_blocked_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_blocker_user_id = p_blocked_user_id then raise exception 'CALL_BLOCK_SELF'; end if;
  insert into public.call_blocks(blocker_user_id,blocked_user_id)
  values(p_blocker_user_id,p_blocked_user_id) on conflict do nothing;
  update public.call_sessions set status='ended',outcome='unavailable',ended_at=coalesce(ended_at,clock_timestamp()),
    updated_at=clock_timestamp(),state_changed_at=clock_timestamp(),state_reason='participant_blocked',version=version+1
  where status in ('creating','ringing','accepted','ending') and
    ((caller_user_id=p_blocker_user_id and recipient_user_id=p_blocked_user_id) or
     (caller_user_id=p_blocked_user_id and recipient_user_id=p_blocker_user_id));
end; $$;
revoke all on function public.block_call_participant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.block_call_participant(uuid,uuid) to service_role;

create or replace function public.cleanup_call_abuse_events()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_count bigint; begin
  delete from public.call_abuse_events where created_at < clock_timestamp() - interval '30 days';
  get diagnostics v_count = row_count; return v_count;
end; $$;
revoke all on function public.cleanup_call_abuse_events() from public,anon,authenticated;
grant execute on function public.cleanup_call_abuse_events() to service_role;

commit;

-- Add to the existing daily privacy Cron job:
-- select public.cleanup_call_abuse_events();
