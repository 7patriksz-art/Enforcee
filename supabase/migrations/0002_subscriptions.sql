-- Enforcee — billing. Run after 0001_init.sql.
--
-- Written by the Stripe webhook using the service role only. A user can read their own
-- row and can never write one, because a subscription you can grant yourself is not a
-- subscription.

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid references auth.users(id) on delete set null,
  email                  text,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  plan                   text not null default 'solo' check (plan in ('solo','team')),
  status                 text not null default 'active',
  seats                  int  not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_email_idx on public.subscriptions (lower(email));

alter table public.subscriptions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='subscriptions' and policyname='subscriptions_select_own') then
    create policy subscriptions_select_own on public.subscriptions
      for select using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
