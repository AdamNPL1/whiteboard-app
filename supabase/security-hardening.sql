-- Run after the Scriboo schema scripts in the Supabase SQL Editor.
-- This migration is idempotent: it can be rerun safely after a deployment.
-- It makes the browser/database trust boundary explicit instead of relying on
-- Supabase public-schema default grants.

begin;

alter table public.boards enable row level security;
alter table public.user_board_state enable row level security;
alter table public.profiles enable row level security;
alter table public.board_shares enable row level security;
alter table public.board_versions enable row level security;
alter table public.board_personal_notes enable row level security;
alter table public.call_sessions enable row level security;
alter table public.call_participant_states enable row level security;
alter table public.call_state_events enable row level security;
alter table public.call_signal_messages enable row level security;
alter table public.call_device_ownership enable row level security;
alter table public.call_blocks enable row level security;
alter table public.call_abuse_events enable row level security;
alter table public.call_push_subscriptions enable row level security;
alter table public.call_notification_preferences enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.stripe_webhook_events enable row level security;

-- Start from no browser access. The small read/write allowlist below is the
-- complete intended Data API surface. service_role intentionally bypasses RLS
-- and is only used in server-only modules after API authorization checks.
revoke all on table
  public.boards,
  public.user_board_state,
  public.profiles,
  public.board_shares,
  public.board_versions,
  public.board_personal_notes,
  public.call_sessions,
  public.call_participant_states,
  public.call_state_events,
  public.call_signal_messages,
  public.call_device_ownership,
  public.call_blocks,
  public.call_abuse_events,
  public.call_push_subscriptions,
  public.call_notification_preferences,
  public.api_rate_limits,
  public.stripe_webhook_events
from public, anon, authenticated;

grant select on table
  public.boards,
  public.user_board_state,
  public.profiles,
  public.board_shares,
  public.board_versions,
  public.call_sessions,
  public.call_participant_states,
  public.call_state_events,
  public.call_signal_messages
to authenticated;

-- Personal notes are the only table intentionally written directly by the
-- signed-in browser. Its policies bind every row to auth.uid() and board access.
grant select, insert, update, delete
  on table public.board_personal_notes
  to authenticated;

commit;

notify pgrst, 'reload schema';
