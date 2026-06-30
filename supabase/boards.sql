create table if not exists public.boards (
  id text primary key,
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  starred boolean not null default false,
  document jsonb not null default jsonb_build_object(
    'elements', jsonb_build_array(),
    'canvasBackground', '#ffffff',
    'customCanvasBackground', '#131619',
    'gridMode', 'none',
    'gridOpacity', 24,
    'calendarEntries', jsonb_build_array()
  )
);

create index if not exists boards_user_id_idx
  on public.boards (user_id);
create index if not exists boards_created_at_idx
  on public.boards (created_at);
create index if not exists boards_updated_at_idx
  on public.boards (updated_at);
create index if not exists boards_deleted_at_idx
  on public.boards (deleted_at);

create table if not exists public.user_board_state (
  user_id uuid primary key,
  active_board_id text null references public.boards (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_board_state_active_board_id_idx
  on public.user_board_state (active_board_id);
