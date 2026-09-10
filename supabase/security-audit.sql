-- Read-only deployment check. Run in the Supabase SQL Editor after
-- security-hardening.sql. A secure result has zero rows in both result sets.

-- 1. Every expected application table must exist and use RLS.
with expected(tablename) as (
  select unnest(array[
    'boards', 'user_board_state', 'profiles', 'board_shares',
    'board_versions', 'board_personal_notes', 'call_sessions',
    'call_participant_states', 'call_state_events', 'call_signal_messages',
    'call_device_ownership', 'call_blocks', 'call_abuse_events',
    'call_push_subscriptions', 'call_notification_preferences',
    'api_rate_limits', 'stripe_webhook_events'
  ]::text[])
)
select
  expected.tablename,
  case
    when tables.tablename is null then 'MISSING_TABLE'
    else 'RLS_DISABLED'
  end as issue
from expected
left join pg_tables tables
  on tables.schemaname = 'public'
 and tables.tablename = expected.tablename
where tables.tablename is null or not tables.rowsecurity
order by expected.tablename;

-- 2. Browser roles must not have unexpected table privileges. The only direct
-- browser writes allowed are the current user's RLS-protected personal notes.
with allowed(role_name, table_name, privilege_type) as (
  values
    ('authenticated', 'boards', 'SELECT'),
    ('authenticated', 'user_board_state', 'SELECT'),
    ('authenticated', 'profiles', 'SELECT'),
    ('authenticated', 'board_shares', 'SELECT'),
    ('authenticated', 'board_versions', 'SELECT'),
    ('authenticated', 'board_personal_notes', 'SELECT'),
    ('authenticated', 'board_personal_notes', 'INSERT'),
    ('authenticated', 'board_personal_notes', 'UPDATE'),
    ('authenticated', 'board_personal_notes', 'DELETE'),
    ('authenticated', 'call_sessions', 'SELECT'),
    ('authenticated', 'call_participant_states', 'SELECT'),
    ('authenticated', 'call_state_events', 'SELECT'),
    ('authenticated', 'call_signal_messages', 'SELECT')
)
select
  grants.grantee,
  grants.table_name,
  grants.privilege_type
from information_schema.role_table_grants grants
left join allowed
  on allowed.role_name = grants.grantee
 and allowed.table_name = grants.table_name
 and allowed.privilege_type = grants.privilege_type
where grants.table_schema = 'public'
  and grants.grantee in ('anon', 'authenticated')
  and grants.table_name in (
    'boards', 'user_board_state', 'profiles', 'board_shares',
    'board_versions', 'board_personal_notes', 'call_sessions',
    'call_participant_states', 'call_state_events', 'call_signal_messages',
    'call_device_ownership', 'call_blocks', 'call_abuse_events',
    'call_push_subscriptions', 'call_notification_preferences',
    'api_rate_limits', 'stripe_webhook_events'
  )
  and allowed.role_name is null
order by grants.grantee, grants.table_name, grants.privilege_type;
