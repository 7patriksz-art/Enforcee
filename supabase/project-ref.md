# Why the project ref is committed

`project-ref` holds the Supabase project id that `scripts/push-email-templates.mjs` targets.

**It is not a secret.** It is the host part of `NEXT_PUBLIC_SUPABASE_URL`, and Next.js inlines
every `NEXT_PUBLIC_*` variable into the JavaScript it sends to the browser. Verified rather
than assumed, on 2026-08-15: after `npm run build`, the ref appears in
`.next/static/chunks/*.js` — a file served to every visitor of enforcee.com. Anyone who has
loaded the site already has it.

What *is* secret is the service-role key, which lives only in `.env.local` and in Vercel's
environment, is gitignored, and appears in no client bundle.

## Why it is a committed file rather than an env var

The first run of the email-templates workflow failed with:

    No project ref. Pass --ref=<ref>, or set NEXT_PUBLIC_SUPABASE_URL.

The script resolved the ref from `--ref`, `$NEXT_PUBLIC_SUPABASE_URL`, or `.env.local`. On a
GitHub runner none of the three exist, because `.env.local` is gitignored — correctly, since
it holds the service-role key.

That is the same defect as the pixel audit hardcoding `/opt/pw-browsers/chromium-1194/…`, and
as the email logo pointing at a URL only one deploy could answer: **a thing that works only in
the environment that wrote it.** Three instances in one day. The fix is not another fallback,
it is to put the value somewhere every environment can see.

Overrides still win, in this order:

    --ref=<ref>            an explicit argument
    $SUPABASE_PROJECT_REF  an environment override, for a staging project
    supabase/project-ref   this file — the default, present everywhere
