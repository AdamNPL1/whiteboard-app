-- Number 19: durable acknowledgement that the recipient displayed the call.
begin;
alter table public.call_sessions add column if not exists recipient_notified_at timestamptz null;

create or replace function public.acknowledge_incoming_board_call(p_call_id uuid,p_recipient_user_id uuid)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare c public.call_sessions; v_now timestamptz := clock_timestamp(); begin
  select * into c from public.call_sessions where id=p_call_id for update;
  if c.id is null or c.recipient_user_id<>p_recipient_user_id then raise exception 'CALL_NOT_FOUND'; end if;
  if c.status<>'ringing' or c.ring_expires_at<=v_now then raise exception 'CALL_NOT_ACTIVE'; end if;
  update public.call_sessions set recipient_notified_at=coalesce(recipient_notified_at,v_now),updated_at=v_now
  where id=p_call_id returning * into c;
  return c;
end; $$;
revoke all on function public.acknowledge_incoming_board_call(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_incoming_board_call(uuid,uuid) to service_role;
commit;
