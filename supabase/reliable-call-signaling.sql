-- Run once after call-state-machine.sql.
-- Stores only offers and answers, for at most ten minutes. ICE candidates and
-- media never enter this table.
begin;

create table if not exists public.call_signal_messages (
  id uuid primary key,
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  protocol_version integer not null,
  signaling_version bigint not null,
  generation bigint not null,
  sequence_number bigint not null,
  kind text not null,
  payload jsonb not null,
  sent_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '10 minutes',
  constraint call_signal_distinct_participants_check check (sender_user_id <> recipient_user_id),
  constraint call_signal_protocol_check check (protocol_version = 1),
  constraint call_signal_version_check check (signaling_version > 0),
  constraint call_signal_generation_check check (generation >= 0),
  constraint call_signal_sequence_check check (sequence_number > 0),
  constraint call_signal_kind_check check (kind in ('offer', 'answer')),
  constraint call_signal_payload_size_check check (pg_column_size(payload) <= 131072),
  constraint call_signal_expiration_check check (expires_at > created_at),
  unique (call_id, sender_user_id, signaling_version, sequence_number)
);

create index if not exists call_signal_recovery_idx
  on public.call_signal_messages
    (call_id, recipient_user_id, signaling_version, generation desc, sequence_number desc);
create index if not exists call_signal_expiration_idx
  on public.call_signal_messages (expires_at);

alter table public.call_signal_messages enable row level security;
revoke all on table public.call_signal_messages from anon, authenticated;
grant select on table public.call_signal_messages to authenticated;

drop policy if exists "call_signal_messages_select_participant" on public.call_signal_messages;
create policy "call_signal_messages_select_participant"
on public.call_signal_messages for select to authenticated
using (
  (select auth.uid()) in (sender_user_id, recipient_user_id)
  and expires_at > clock_timestamp()
  and exists (
    select 1 from public.call_sessions c
    where c.id = call_id
      and (select auth.uid()) in (c.caller_user_id, c.recipient_user_id)
  )
);

create or replace function public.cleanup_expired_call_signals()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare affected integer;
begin
  delete from public.call_signal_messages where expires_at <= clock_timestamp();
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.cleanup_expired_call_signals() from public, anon, authenticated;
grant execute on function public.cleanup_expired_call_signals() to service_role;

notify pgrst, 'reload schema';
commit;

-- Schedule public.cleanup_expired_call_signals() once per minute with Supabase Cron.
