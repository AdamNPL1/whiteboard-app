-- Secure private Realtime topics for collaborative Scriboo boards.
-- Apply this file in the production Supabase SQL editor before testing live
-- board updates between two accounts.
--
-- Topic format: board:<board-id>

-- Realtime authorization runs as the connected user. A direct query from a
-- realtime.messages policy into boards/board_shares is also filtered by those
-- tables' RLS policies, which can incorrectly hide an otherwise valid shared
-- board. Keep the lookup in one narrowly scoped security-definer function so
-- authorization is based on the actual ownership/share rows.
create or replace function public.can_access_board_realtime(
  requested_topic text,
  require_editor boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.boards
    where 'board:' || boards.id = requested_topic
      and boards.deleted_at is null
      and (
        boards.user_id = (select auth.uid())
        or exists (
          select 1
          from public.board_shares
          where board_shares.board_id = boards.id
            and board_shares.recipient_user_id = (select auth.uid())
            and board_shares.status = 'accepted'
            and (
              not require_editor
              or board_shares.permission = 'editor'
            )
        )
      )
  );
$$;

revoke all on function public.can_access_board_realtime(text, boolean)
from public, anon;
grant execute on function public.can_access_board_realtime(text, boolean)
to authenticated;

drop policy if exists "scriboo_board_topics_read" on realtime.messages;
create policy "scriboo_board_topics_read"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select public.can_access_board_realtime(
    (select realtime.topic()),
    false
  ))
);

drop policy if exists "scriboo_board_topics_write" on realtime.messages;
create policy "scriboo_board_topics_write"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select public.can_access_board_realtime(
    (select realtime.topic()),
    true
  ))
);

