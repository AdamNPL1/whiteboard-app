create table if not exists public.board_personal_notes (
  board_id text not null references public.boards (id) on delete cascade,
  user_id uuid not null,
  title text not null default 'My private notes',
  content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (board_id, user_id),
  constraint board_personal_notes_title_length check (char_length(title) <= 120),
  constraint board_personal_notes_content_length check (char_length(content) <= 100000)
);

create index if not exists board_personal_notes_user_id_idx
  on public.board_personal_notes (user_id);

alter table public.board_personal_notes enable row level security;

drop policy if exists "personal_notes_select_own" on public.board_personal_notes;
create policy "personal_notes_select_own"
on public.board_personal_notes for select to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.boards board
    where board.id = board_id
      and (
        board.user_id = auth.uid()
        or exists (
          select 1 from public.board_shares share
          where share.board_id = board.id
            and share.recipient_user_id = auth.uid()
            and share.status = 'accepted'
        )
      )
  )
);

drop policy if exists "personal_notes_insert_own" on public.board_personal_notes;
create policy "personal_notes_insert_own"
on public.board_personal_notes for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.boards board
    where board.id = board_id
      and (
        board.user_id = auth.uid()
        or exists (
          select 1 from public.board_shares share
          where share.board_id = board.id
            and share.recipient_user_id = auth.uid()
            and share.status = 'accepted'
        )
      )
  )
);

drop policy if exists "personal_notes_update_own" on public.board_personal_notes;
create policy "personal_notes_update_own"
on public.board_personal_notes for update to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.boards board
    where board.id = board_id
      and (
        board.user_id = auth.uid()
        or exists (
          select 1 from public.board_shares share
          where share.board_id = board.id
            and share.recipient_user_id = auth.uid()
            and share.status = 'accepted'
        )
      )
  )
)
with check (auth.uid() = user_id);

drop policy if exists "personal_notes_delete_own" on public.board_personal_notes;
create policy "personal_notes_delete_own"
on public.board_personal_notes for delete to authenticated
using (auth.uid() = user_id);

revoke all on table public.board_personal_notes from anon;
grant select, insert, update, delete on table public.board_personal_notes to authenticated;

notify pgrst, 'reload schema';
