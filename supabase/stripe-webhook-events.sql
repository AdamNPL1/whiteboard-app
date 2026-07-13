-- Run once in the Supabase SQL Editor before deploying the matching app code.
-- This is a privacy-safe idempotency ledger for Stripe webhooks. It stores no
-- Stripe payloads, customer emails, card data, or other personal information.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  first_received_at timestamptz not null default now(),
  processing_started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error_code text
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, processing_started_at);

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from anon, authenticated;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_stale_after_seconds integer default 300
)
returns table (claimed boolean, already_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.stripe_webhook_events%rowtype;
  inserted_count integer;
  current_time timestamptz := clock_timestamp();
begin
  if length(trim(p_event_id)) = 0 or length(trim(p_event_type)) = 0 then
    raise exception 'Stripe event ID and type are required';
  end if;

  if p_stale_after_seconds < 30 then
    raise exception 'Stale timeout must be at least 30 seconds';
  end if;

  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    status,
    attempts,
    first_received_at,
    processing_started_at
  ) values (
    p_event_id,
    p_event_type,
    'processing',
    1,
    current_time,
    current_time
  )
  on conflict (event_id) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    claimed := true;
    already_completed := false;
    return next;
    return;
  end if;

  select * into existing
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if existing.status = 'completed' then
    claimed := false;
    already_completed := true;
    return next;
    return;
  end if;

  if existing.status = 'processing'
     and existing.processing_started_at
       > current_time - make_interval(secs => p_stale_after_seconds) then
    claimed := false;
    already_completed := false;
    return next;
    return;
  end if;

  update public.stripe_webhook_events
  set
    event_type = p_event_type,
    status = 'processing',
    attempts = attempts + 1,
    processing_started_at = current_time,
    completed_at = null,
    last_error_code = null
  where event_id = p_event_id;

  claimed := true;
  already_completed := false;
  return next;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, integer)
  from public;
grant execute on function public.claim_stripe_webhook_event(text, text, integer)
  to service_role;

-- Optional maintenance. Event IDs contain no customer data, but old completed
-- rows can be removed after they are no longer useful for duplicate detection.
-- delete from public.stripe_webhook_events
-- where status = 'completed' and completed_at < now() - interval '180 days';
