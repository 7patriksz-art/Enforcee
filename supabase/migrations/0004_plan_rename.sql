-- Enforcee — plan names changed from solo/team to builder/founder, and billing gained a
-- yearly interval. Run after 0003_marketing.sql.

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('builder','founder','solo','team'));

alter table public.subscriptions add column if not exists interval text not null default 'monthly'
  check (interval in ('monthly','yearly'));

update public.subscriptions set plan = 'builder' where plan = 'solo';
update public.subscriptions set plan = 'founder' where plan = 'team';
