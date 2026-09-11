-- Run after the Scriboo schema scripts in the Supabase SQL Editor.
-- This migration is idempotent and supports projects where an optional
-- feature table has not been installed yet. Existing tables are hardened;
-- security-audit.sql reports anything that is missing.

begin;

do $security$
declare
  table_name text;
  application_tables constant text[] := array[
    'boards', 'user_board_state', 'profiles', 'board_shares', 'board_share_audit_events',
    'board_versions', 'board_personal_notes', 'call_sessions',
    'call_participant_states', 'call_state_events', 'call_signal_messages',
    'call_device_ownership', 'call_blocks', 'call_abuse_events',
    'call_push_subscriptions', 'call_notification_preferences',
    'api_rate_limits', 'stripe_webhook_events'
  ];
  browser_read_tables constant text[] := array[
    'boards', 'user_board_state', 'profiles', 'board_shares',
    'board_versions', 'call_sessions', 'call_participant_states',
    'call_state_events', 'call_signal_messages'
  ];
begin
  foreach table_name in array application_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format(
        'revoke all on table public.%I from public, anon, authenticated',
        table_name
      );
    end if;
  end loop;

  -- These tables expose RLS-filtered reads to signed-in browser users. All
  -- mutations continue through trusted server routes.
  foreach table_name in array browser_read_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'grant select on table public.%I to authenticated',
        table_name
      );
    end if;
  end loop;

  -- Personal notes are the only table intentionally written directly by the
  -- browser. Its policies bind rows to auth.uid() and current board access.
  if to_regclass('public.board_personal_notes') is not null then
    grant select, insert, update, delete
      on table public.board_personal_notes
      to authenticated;
  end if;
end
$security$;

commit;

notify pgrst, 'reload schema';
