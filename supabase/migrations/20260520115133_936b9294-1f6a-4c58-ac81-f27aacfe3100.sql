create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "public all" on public.push_subscriptions for all using (true) with check (true);
create index push_subscriptions_endpoint_idx on public.push_subscriptions(endpoint);