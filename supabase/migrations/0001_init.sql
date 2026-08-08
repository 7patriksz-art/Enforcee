-- Enforcio / Ruleceipt — initial schema
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Design notes:
--  * Row-level security is on from the first migration, not bolted on later. Users paste
--    system prompts here — often the most sensitive text they own — so the default must be
--    that nobody can read anyone else's row, including us via the anon key.
--  * Receipts are stored whole, as the canonical JSON that was hashed. Storing a
--    reconstructed copy would break the digest and make the receipt worthless.
--  * The cost ledger is its own table so unit economics can be queried without joining
--    through receipts, and so a call that fails mid-audit is still accounted for.

create extension if not exists "pgcrypto";

-- ── rulesets ────────────────────────────────────────────────────────────────────
-- Content-addressed. The same ruleset text uploaded twice is one row per user, which
-- is what makes per-rule history across audits possible.
create table if not exists public.rulesets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'Untitled ruleset',
  artifact      text not null default 'ruleset',
  body          text not null,
  body_hash     text not null,
  rule_count    int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, body_hash)
);

-- ── audits ──────────────────────────────────────────────────────────────────────
create table if not exists public.audits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  ruleset_id     uuid references public.rulesets(id) on delete set null,
  digest         text not null,
  previous_digest text,
  ruleset_hash   text not null,
  output_hash    text not null,
  mode           text not null check (mode in ('deterministic','full')),
  engine         jsonb not null,
  summary        jsonb not null,
  receipt        jsonb not null,
  output_text    text,
  total_usd      numeric(12,8) not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists audits_user_created_idx on public.audits (user_id, created_at desc);
create index if not exists audits_ruleset_idx on public.audits (ruleset_id, created_at desc);
create unique index if not exists audits_user_digest_idx on public.audits (user_id, digest);

-- ── per-rule results ────────────────────────────────────────────────────────────
-- Denormalised out of the receipt on purpose: this is the table that answers
-- "rule a3f9 has failed 6 of your last 40 sessions", which is the whole longitudinal
-- product. Querying it out of jsonb every time would not hold up.
create table if not exists public.rule_results (
  id          bigserial primary key,
  audit_id    uuid not null references public.audits(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rule_id     text not null,
  rule_text   text not null,
  verdict     text not null check (verdict in ('FOLLOWED','VIOLATED','NOT_APPLICABLE','UNVERIFIABLE')),
  method      text not null check (method in ('deterministic','judged','structural')),
  engaged     boolean not null default false,
  agreement   real,
  downgraded  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists rule_results_rule_idx on public.rule_results (user_id, rule_id, created_at desc);
create index if not exists rule_results_audit_idx on public.rule_results (audit_id);

-- ── cost ledger ─────────────────────────────────────────────────────────────────
-- Every model call, priced. The product's price is set from this table.
create table if not exists public.cost_ledger (
  id                 bigserial primary key,
  user_id            uuid references auth.users(id) on delete set null,
  audit_id           uuid references public.audits(id) on delete set null,
  model              text not null,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_read_tokens  int not null default 0,
  cache_write_tokens int not null default 0,
  usd                numeric(12,8) not null default 0,
  purpose            text,
  created_at         timestamptz not null default now()
);

create index if not exists cost_ledger_user_idx on public.cost_ledger (user_id, created_at desc);
create index if not exists cost_ledger_created_idx on public.cost_ledger (created_at desc);

-- ── row-level security ──────────────────────────────────────────────────────────
alter table public.rulesets     enable row level security;
alter table public.audits       enable row level security;
alter table public.rule_results enable row level security;
alter table public.cost_ledger  enable row level security;

-- Each policy is spelled out per verb rather than using `for all`, so a future change
-- to one verb cannot silently widen the others.
do $$
begin
  if not exists (select 1 from pg_policies where tablename='rulesets' and policyname='rulesets_select_own') then
    create policy rulesets_select_own on public.rulesets for select using (auth.uid() = user_id);
    create policy rulesets_insert_own on public.rulesets for insert with check (auth.uid() = user_id);
    create policy rulesets_update_own on public.rulesets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    create policy rulesets_delete_own on public.rulesets for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename='audits' and policyname='audits_select_own') then
    create policy audits_select_own on public.audits for select using (auth.uid() = user_id);
    create policy audits_insert_own on public.audits for insert with check (auth.uid() = user_id);
    create policy audits_delete_own on public.audits for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename='rule_results' and policyname='rule_results_select_own') then
    create policy rule_results_select_own on public.rule_results for select using (auth.uid() = user_id);
    create policy rule_results_insert_own on public.rule_results for insert with check (auth.uid() = user_id);
  end if;

  -- The cost ledger is deliberately read-only to the user: they can see what their own
  -- audits cost, and nothing can rewrite the accounting from the browser.
  if not exists (select 1 from pg_policies where tablename='cost_ledger' and policyname='cost_ledger_select_own') then
    create policy cost_ledger_select_own on public.cost_ledger for select using (auth.uid() = user_id);
  end if;
end $$;

-- ── retention ───────────────────────────────────────────────────────────────────
-- Fourteen days of history on the free tier, per the pricing decision. This function is
-- called by a scheduled job; it is written so it can also be run by hand safely.
create or replace function public.prune_free_history(retain_days int default 14)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  delete from public.audits
  where created_at < now() - make_interval(days => retain_days)
  returning 1 into removed;
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_free_history(int) from public, anon, authenticated;

-- ── updated_at ──────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists rulesets_touch on public.rulesets;
create trigger rulesets_touch before update on public.rulesets
  for each row execute function public.touch_updated_at();
