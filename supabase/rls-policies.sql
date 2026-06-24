alter table public.boards enable row level security;
alter table public.user_board_state enable row level security;

drop policy if exists "boards_select_own" on public.boards;
create policy "boards_select_own"
on public.boards
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "boards_insert_own" on public.boards;
create policy "boards_insert_own"
on public.boards
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "boards_update_own" on public.boards;
create policy "boards_update_own"
on public.boards
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "boards_delete_own" on public.boards;
create policy "boards_delete_own"
on public.boards
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_board_state_select_own" on public.user_board_state;
create policy "user_board_state_select_own"
on public.user_board_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_board_state_insert_own" on public.user_board_state;
create policy "user_board_state_insert_own"
on public.user_board_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_board_state_update_own" on public.user_board_state;
create policy "user_board_state_update_own"
on public.user_board_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_board_state_delete_own" on public.user_board_state;
create policy "user_board_state_delete_own"
on public.user_board_state
for delete
to authenticated
using (auth.uid() = user_id);
