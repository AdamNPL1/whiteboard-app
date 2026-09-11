-- Immutable server-only history for invitations, access changes and revocations.
-- Run once in the Supabase SQL Editor after board-shares.sql.
begin;

create table if not exists public.board_share_audit_events (
  id bigint generated always as identity primary key,
  board_id text not null,
  share_id text not null,
  actor_user_id uuid null,
  recipient_user_id uuid null,
  shared_with_email text not null,
  event_type text not null check (event_type in ('invited', 'reinvited', 'accepted', 'permission_changed', 'revoked')),
  old_permission text null,
  new_permission text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists board_share_audit_board_created_idx
  on public.board_share_audit_events (board_id, created_at desc);

alter table public.board_share_audit_events enable row level security;
revoke all on table public.board_share_audit_events from public, anon, authenticated;
revoke all on sequence public.board_share_audit_events_id_seq from public, anon, authenticated;

create or replace function public.audit_board_share_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_event text;
  audit_actor uuid;
begin
  if tg_op = 'INSERT' then
    audit_event := 'invited';
    audit_actor := new.owner_user_id;
  elsif tg_op = 'DELETE' then
    audit_event := 'revoked';
    audit_actor := old.owner_user_id;
  elsif old.status = 'pending' and new.status = 'accepted' then
    audit_event := 'accepted';
    audit_actor := new.recipient_user_id;
  elsif old.permission is distinct from new.permission then
    audit_event := 'permission_changed';
    audit_actor := new.owner_user_id;
  elsif old.invite_token_hash is distinct from new.invite_token_hash then
    audit_event := 'reinvited';
    audit_actor := new.owner_user_id;
  else
    return coalesce(new, old);
  end if;

  insert into public.board_share_audit_events (
    board_id, share_id, actor_user_id, recipient_user_id, shared_with_email,
    event_type, old_permission, new_permission
  ) values (
    coalesce(new.board_id, old.board_id), coalesce(new.id, old.id), audit_actor,
    coalesce(new.recipient_user_id, old.recipient_user_id),
    coalesce(new.shared_with_email, old.shared_with_email), audit_event,
    case when tg_op = 'INSERT' then null else old.permission end,
    case when tg_op = 'DELETE' then null else new.permission end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists board_shares_audit_change on public.board_shares;
create trigger board_shares_audit_change
after insert or update or delete on public.board_shares
for each row execute function public.audit_board_share_change();

revoke all on function public.audit_board_share_change() from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
