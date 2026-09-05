-- Browser push subscriptions and call-notification preferences.
begin;

create table if not exists public.call_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists call_push_subscriptions_user_idx
  on public.call_push_subscriptions(user_id);
alter table public.call_push_subscriptions enable row level security;
revoke all on table public.call_push_subscriptions from public, anon, authenticated;

create table if not exists public.call_notification_preferences (
  user_id uuid primary key,
  enabled boolean not null default true,
  ringing_enabled boolean not null default true,
  dnd_until timestamptz null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.call_notification_preferences enable row level security;
revoke all on table public.call_notification_preferences from public, anon, authenticated;

commit;
