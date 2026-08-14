-- Secure private Realtime topics for collaborative Scriboo boards.
-- Apply this file in the production Supabase SQL editor before testing live
-- board updates between two accounts.
--
-- Topic format: board:<board-id>

drop policy if exists "scriboo_board_topics_read" on realtime.messages;
create policy "scriboo_board_topics_read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1
    from public.boards
    where 'board:' || boards.id = (select realtime.topic())
      and boards.deleted_at is null
      and (
        boards.user_id = (select auth.uid())
        or exists (
          select 1
          from public.board_shares
          where board_shares.board_id = boards.id
            and board_shares.recipient_user_id = (select auth.uid())
            and board_shares.status = 'accepted'
        )
      )
  )
);

drop policy if exists "scriboo_board_topics_write" on realtime.messages;
create policy "scriboo_board_topics_write"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1
    from public.boards
    where 'board:' || boards.id = (select realtime.topic())
      and boards.deleted_at is null
      and (
        boards.user_id = (select auth.uid())
        or exists (
          select 1
          from public.board_shares
          where board_shares.board_id = boards.id
            and board_shares.recipient_user_id = (select auth.uid())
            and board_shares.status = 'accepted'
            and board_shares.permission = 'editor'
        )
      )
  )
);

