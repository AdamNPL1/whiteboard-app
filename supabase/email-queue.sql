-- Run once before deploying the matching application code.
begin;

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('board_share_invite', 'account_deleted', 'subscription_lifecycle', 'support_request')),
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default timezone('utc', now()),
  processing_started_at timestamptz null,
  sent_at timestamptz null,
  last_error_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists email_jobs_worker_idx on public.email_jobs (status, available_at);
alter table public.email_jobs enable row level security;
revoke all on table public.email_jobs from public, anon, authenticated;

create or replace function public.claim_email_jobs(p_limit integer default 10, p_stale_seconds integer default 900)
returns setof public.email_jobs
language plpgsql security definer set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 50 or p_stale_seconds < 60 then raise exception 'INVALID_EMAIL_CLAIM'; end if;
  return query
  with candidates as (
    select id from public.email_jobs
    where (status = 'pending' and available_at <= clock_timestamp())
       or (status = 'processing' and processing_started_at < clock_timestamp() - make_interval(secs => p_stale_seconds))
    order by available_at, created_at
    for update skip locked limit p_limit
  )
  update public.email_jobs jobs set
    status = 'processing', attempts = jobs.attempts + 1,
    processing_started_at = clock_timestamp(), updated_at = clock_timestamp()
  from candidates where jobs.id = candidates.id returning jobs.*;
end;
$$;

revoke all on function public.claim_email_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_email_jobs(integer, integer) to service_role;
commit;
notify pgrst, 'reload schema';
