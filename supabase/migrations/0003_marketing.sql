-- Enforcee — the marketing workspace. Run after 0002_subscriptions.sql.
--
-- This is the shared surface where the founder and the builder sketch outreach: what gets
-- posted, where, when, and what state it is in. Gated to an explicit admin allowlist —
-- there is no path from a normal signed-in user to any row here.

create table if not exists public.campaign_items (
  id            uuid primary key default gen_random_uuid(),
  surface       text not null,                       -- 'reddit:r/ClaudeAI', 'hn', 'devto', 'github-issue', ...
  kind          text not null default 'post'
                check (kind in ('post','comment','reply','submission','article','video','email','other')),
  title         text not null,
  body          text not null default '',
  status        text not null default 'idea'
                check (status in ('idea','drafting','ready','scheduled','posted','killed')),
  scheduled_for timestamptz,
  posted_url    text,
  notes         text not null default '',
  -- Rules the surface imposes, kept next to the draft so they cannot be forgotten at 1am.
  constraints   text not null default '',
  effort_hours  numeric(4,1) not null default 1,
  author        text not null default 'claude',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists campaign_status_idx on public.campaign_items (status, scheduled_for);
create index if not exists campaign_surface_idx on public.campaign_items (surface);

alter table public.campaign_items enable row level security;

-- Deliberately no permissive policy. With RLS on and no policy, the anon and authenticated
-- roles can read nothing at all; the app reaches this table with the service role only,
-- after checking the caller's email against ADMIN_EMAILS. Access control lives in one place.

drop trigger if exists campaign_touch on public.campaign_items;
create trigger campaign_touch before update on public.campaign_items
  for each row execute function public.touch_updated_at();
