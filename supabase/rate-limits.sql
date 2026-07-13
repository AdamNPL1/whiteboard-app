-- Run once in the Supabase SQL Editor. This creates an atomic, server-side
-- rate limiter used by Scriboo API routes. Raw IP addresses and emails are
-- never stored; the application sends SHA-256 hashes only.

create table if not exists public.api_rate_limits (
  action text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (action, identifier_hash)
);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_action text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.api_rate_limits%rowtype;
  current_time timestamptz := clock_timestamp();
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  insert into public.api_rate_limits as limits (
    action, identifier_hash, window_started_at, request_count
  ) values (
    p_action, p_identifier_hash, current_time, 1
  )
  on conflict (action, identifier_hash) do update
  set
    window_started_at = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= current_time
        then current_time
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at + make_interval(secs => p_window_seconds) <= current_time
        then 1
      else limits.request_count + 1
    end
  returning * into current_row;

  allowed := current_row.request_count <= p_limit;
  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (
      current_row.window_started_at
      + make_interval(secs => p_window_seconds)
      - current_time
    )))::integer
  );
  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

-- Optional maintenance; safe to run periodically.
-- delete from public.api_rate_limits where window_started_at < now() - interval '2 days';
