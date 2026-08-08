-- Enforcee — spend protection for the judged path. Run after 0004_plan_rename.sql.
--
-- /api/audit is a public endpoint that, in full mode, spends our Anthropic budget. Without
-- a counter in front of it, one script can empty the account overnight. This table is that
-- counter: a per-day tally keyed by a salted hash of the caller, plus a global row that acts
-- as a circuit breaker for the whole deployment.
--
-- RLS is on with no policy: only the service role touches this, from the API route.

create table if not exists public.judge_quota (
  day       date not null,
  bucket    text not null,          -- salted caller hash, or '__global__'
  count     int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, bucket)
);

alter table public.judge_quota enable row level security;

-- Atomic increment-and-read. Doing this in SQL rather than read-then-write is the whole
-- point: two concurrent requests must not both see the same pre-increment value.
create or replace function public.bump_judge_quota(p_bucket text, p_limit int)
returns table (allowed boolean, used int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  insert into public.judge_quota (day, bucket, count)
  values (current_date, p_bucket, 1)
  on conflict (day, bucket)
    do update set count = public.judge_quota.count + 1, updated_at = now()
  returning public.judge_quota.count into v_used;

  return query select (v_used <= p_limit), v_used;
end $$;

revoke all on function public.bump_judge_quota(text, int) from public, anon, authenticated;

-- Housekeeping: quota rows older than 30 days are noise.
create or replace function public.prune_judge_quota()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.judge_quota where day < current_date - 30;
  get diagnostics n = row_count;
  return n;
end $$;
