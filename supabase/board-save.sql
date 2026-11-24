-- Run once in the Supabase SQL Editor before deploying the matching app code.
-- Saves one board atomically without loading the user's other boards.

create or replace function public.save_board_document(
  p_board_id text,
  p_user_id uuid,
  p_document jsonb,
  p_expected_updated_at timestamptz default null,
  p_can_use_calendar boolean default false
)
returns table (board_id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_board public.boards%rowtype;
  v_permission text;
  v_document jsonb;
  v_updated_at timestamptz;
  v_latest_snapshot_at timestamptz;
  v_force_snapshot boolean;
begin
  select b.*
  into v_board
  from public.boards b
  where b.id = p_board_id
    and b.deleted_at is null
    and (
      b.user_id = p_user_id
      or exists (
        select 1
        from public.board_shares s
        where s.board_id = b.id
          and s.recipient_user_id = p_user_id
          and s.status = 'accepted'
      )
    )
  for update;

  if not found then
    raise exception using message = 'BOARD_NOT_FOUND', errcode = 'P0001';
  end if;

  if v_board.user_id <> p_user_id then
    select s.permission
    into v_permission
    from public.board_shares s
    where s.board_id = p_board_id
      and s.recipient_user_id = p_user_id
      and s.status = 'accepted'
    order by s.updated_at desc
    limit 1;

    if v_permission is distinct from 'editor' then
      raise exception using message = 'BOARD_FORBIDDEN', errcode = 'P0001';
    end if;
  end if;

  if p_expected_updated_at is not null
    and v_board.updated_at is distinct from p_expected_updated_at then
    raise exception using message = 'BOARD_SAVE_CONFLICT', errcode = 'P0001';
  end if;

  v_document := coalesce(p_document, '{}'::jsonb);
  if not p_can_use_calendar then
    v_document := jsonb_set(
      v_document,
      '{calendarEntries}',
      coalesce(v_board.document -> 'calendarEntries', '[]'::jsonb),
      true
    );
  end if;

  v_force_snapshot :=
    jsonb_array_length(coalesce(v_board.document -> 'elements', '[]'::jsonb)) > 0
    and jsonb_array_length(coalesce(v_document -> 'elements', '[]'::jsonb)) = 0;

  select bv.created_at
  into v_latest_snapshot_at
  from public.board_versions bv
  where bv.board_id = p_board_id
  order by bv.created_at desc
  limit 1;

  if v_force_snapshot
    or v_latest_snapshot_at is null
    or v_latest_snapshot_at <= clock_timestamp() - interval '5 minutes' then
    insert into public.board_versions (
      id,
      board_id,
      owner_user_id,
      board_name,
      document,
      reason,
      source_updated_at,
      created_at
    ) values (
      gen_random_uuid()::text,
      v_board.id,
      v_board.user_id,
      v_board.name,
      v_board.document,
      'automatic',
      v_board.updated_at,
      clock_timestamp()
    );

    delete from public.board_versions bv
    where bv.board_id = p_board_id
      and bv.created_at < clock_timestamp() - interval '30 days';

    delete from public.board_versions bv
    where bv.id in (
      select old_version.id
      from public.board_versions old_version
      where old_version.board_id = p_board_id
      order by old_version.created_at desc
      offset 50
    );
  end if;

  v_updated_at := clock_timestamp();
  update public.boards b
  set document = v_document,
      updated_at = v_updated_at
  where b.id = p_board_id;

  return query select p_board_id, v_updated_at;
end;
$$;

revoke all on function public.save_board_document(text, uuid, jsonb, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.save_board_document(text, uuid, jsonb, timestamptz, boolean)
  to service_role;

notify pgrst, 'reload schema';
