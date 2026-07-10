create table if not exists public.profiles (
  id text primary key,
  email text not null,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  plan text not null default 'basic',
  subscription_status text not null default 'inactive',
  subscription_cancel_at_period_end boolean not null default false,
  subscription_current_period_end timestamptz null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  onboarding_status text not null default 'new'
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);
create index if not exists profiles_stripe_subscription_id_idx
  on public.profiles (stripe_subscription_id);

alter table public.profiles
  alter column plan set default 'basic';
alter table public.profiles
  add column if not exists subscription_status text not null default 'inactive';
alter table public.profiles
  add column if not exists subscription_cancel_at_period_end boolean not null default false;
alter table public.profiles
  add column if not exists subscription_current_period_end timestamptz null;
alter table public.profiles
  add column if not exists stripe_customer_id text null;
alter table public.profiles
  add column if not exists stripe_subscription_id text null;

update public.profiles
set
  plan = case
    when plan = 'master' then 'master'
    when plan = 'pro' then 'pro'
    else 'basic'
  end,
  subscription_status = coalesce(subscription_status, 'inactive'),
  subscription_cancel_at_period_end = coalesce(subscription_cancel_at_period_end, false)
where true;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid()::text = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid()::text = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid()::text = id)
with check (auth.uid()::text = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (auth.uid()::text = id);
