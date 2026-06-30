create table if not exists public.board_shares (
  id text primary key,
  board_id text not null references public.boards (id) on delete cascade,
  owner_user_id uuid not null,
  shared_with_email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint board_shares_unique_board_email unique (board_id, shared_with_email)
);

create index if not exists board_shares_owner_user_id_idx
  on public.board_shares (owner_user_id);
create index if not exists board_shares_shared_with_email_idx
  on public.board_shares (shared_with_email);
create index if not exists board_shares_board_id_idx
  on public.board_shares (board_id);

alter table public.board_shares enable row level security;

drop policy if exists "board_shares_select_owner" on public.board_shares;
create policy "board_shares_select_owner"
on public.board_shares
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "board_shares_insert_owner" on public.board_shares;
create policy "board_shares_insert_owner"
on public.board_shares
for insert
to authenticated
with check (auth.uid() = owner_user_id);

drop policy if exists "board_shares_delete_owner" on public.board_shares;
create policy "board_shares_delete_owner"
on public.board_shares
for delete
to authenticated
using (auth.uid() = owner_user_id);
