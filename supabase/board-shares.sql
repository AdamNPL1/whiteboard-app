create table if not exists public.board_shares (
  id text primary key,
  board_id text not null references public.boards (id) on delete cascade,
  owner_user_id uuid not null,
  shared_with_email text not null,
  recipient_user_id uuid null,
  permission text not null default 'editor',
  status text not null default 'pending',
  invite_token_hash text null unique,
  invite_expires_at timestamptz null,
  accepted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint board_shares_unique_board_email unique (board_id, shared_with_email)
);

alter table public.board_shares
  add column if not exists recipient_user_id uuid null,
  add column if not exists permission text not null default 'editor',
  add column if not exists status text not null default 'pending',
  add column if not exists invite_token_hash text null,
  add column if not exists invite_expires_at timestamptz null,
  add column if not exists accepted_at timestamptz null;

do $$ begin
  alter table public.board_shares add constraint board_shares_permission_check
    check (permission in ('viewer', 'editor'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.board_shares add constraint board_shares_status_check
    check (status in ('pending', 'accepted'));
exception when duplicate_object then null;
end $$;

-- Existing shares become account-bound when their recipient already has a
-- Scriboo profile. Unmatched addresses remain pending and must be re-invited.
update public.board_shares shares
set
  recipient_user_id = profiles.id::uuid,
  status = 'accepted',
  accepted_at = coalesce(shares.accepted_at, shares.created_at),
  invite_token_hash = null,
  invite_expires_at = null
from public.profiles profiles
where shares.recipient_user_id is null
  and lower(profiles.email) = lower(shares.shared_with_email);

create index if not exists board_shares_owner_user_id_idx
  on public.board_shares (owner_user_id);
create index if not exists board_shares_shared_with_email_idx
  on public.board_shares (shared_with_email);
create index if not exists board_shares_board_id_idx
  on public.board_shares (board_id);
create index if not exists board_shares_recipient_status_idx
  on public.board_shares (recipient_user_id, status);
create unique index if not exists board_shares_invite_token_hash_idx
  on public.board_shares (invite_token_hash)
  where invite_token_hash is not null;

alter table public.board_shares enable row level security;

drop policy if exists "board_shares_select_owner" on public.board_shares;
create policy "board_shares_select_owner"
on public.board_shares
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "board_shares_select_recipient" on public.board_shares;
create policy "board_shares_select_recipient"
on public.board_shares
for select
to authenticated
using (
  status = 'accepted'
  and auth.uid() = recipient_user_id
);

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

-- Make the newly created table immediately visible to the Supabase Data API.
notify pgrst, 'reload schema';
