-- Run once in the Supabase SQL Editor before deploying the matching app code.
-- Board versions contain historical board content and are retained for 30 days.

create table if not exists public.board_versions (
  id text primary key,
  board_id text not null references public.boards (id) on delete cascade,
  owner_user_id uuid not null,
  board_name text not null,
  document jsonb not null,
  reason text not null default 'automatic'
    check (reason in ('automatic', 'before_restore', 'before_trash')),
  source_updated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists board_versions_board_created_idx
  on public.board_versions (board_id, created_at desc);
create index if not exists board_versions_owner_created_idx
  on public.board_versions (owner_user_id, created_at desc);

alter table public.board_versions enable row level security;

drop policy if exists "board_versions_select_owner" on public.board_versions;
create policy "board_versions_select_owner"
on public.board_versions
for select
to authenticated
using (auth.uid() = owner_user_id);

-- Writes are intentionally server-only. The service-role client creates and
-- restores snapshots only after the API has verified board ownership.

notify pgrst, 'reload schema';
