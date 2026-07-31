alter table public.boards enable row level security;
alter table public.user_board_state enable row level security;

drop policy if exists "boards_select_own" on public.boards;
create policy "boards_select_own"
on public.boards
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "boards_insert_own" on public.boards;
drop policy if exists "boards_update_own" on public.boards;
drop policy if exists "boards_delete_own" on public.boards;

-- Board mutations must pass through trusted server code, which verifies the
-- authenticated user, ownership or editor access, and subscription limits.
revoke all on table public.boards from anon, authenticated;
grant select on table public.boards to authenticated;

drop policy if exists "user_board_state_select_own" on public.user_board_state;
create policy "user_board_state_select_own"
on public.user_board_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_board_state_insert_own" on public.user_board_state;
drop policy if exists "user_board_state_update_own" on public.user_board_state;
drop policy if exists "user_board_state_delete_own" on public.user_board_state;

-- The active-board pointer is also server-owned so a browser cannot write an
-- arbitrary board ID into its account state.
revoke all on table public.user_board_state from anon, authenticated;
grant select on table public.user_board_state to authenticated;

-- Enforce finite board limits inside Postgres as well as in the API. The
-- transaction-scoped advisory lock prevents concurrent create/restore requests
-- for the same user from racing past the count.
create or replace function public.enforce_board_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_plan text;
  profile_status text;
  maximum_boards integer;
  active_board_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.deleted_at is not null then
      return new;
    end if;

    if old.deleted_at is null and new.user_id = old.user_id then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select plan, subscription_status
  into profile_plan, profile_status
  from public.profiles
  where id = new.user_id::text;

  if coalesce(profile_status, 'inactive') not in ('trialing', 'active', 'past_due') then
    maximum_boards := 1;
  elsif coalesce(profile_plan, 'basic') = 'basic' then
    maximum_boards := 5;
  else
    return new;
  end if;

  select count(*)
  into active_board_count
  from public.boards
  where user_id = new.user_id
    and deleted_at is null
    and id <> new.id;

  if active_board_count >= maximum_boards then
    raise exception 'BOARD_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_board_plan_limit() from public, anon, authenticated;

drop trigger if exists enforce_board_plan_limit_trigger on public.boards;
create trigger enforce_board_plan_limit_trigger
before insert or update of deleted_at, user_id on public.boards
for each row execute function public.enforce_board_plan_limit();

notify pgrst, 'reload schema';
