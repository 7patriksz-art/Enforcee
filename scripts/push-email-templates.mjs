#!/usr/bin/env node
/**
 * Push the four auth email templates into Supabase over the Management API.
 *
 * WHY THIS EXISTS
 *
 * Patrik has pasted these templates into the Supabase dashboard by hand three times, and
 * each round has cost a live bug: once the SVG logo, once the hosted PNG, and once the
 * templates simply going stale because the repo moved and the dashboard did not. The last
 * round he could not do at all — he was on a phone, and you cannot select 60 lines of HTML
 * out of a chat transcript on a phone.
 *
 * CLAUDE.md: "Never hand a manual step to the user that a machine could do. If a loop needs
 * a human to read a screen you cannot see, that is the finding, not a step in the process."
 * Four templates x every edit, forever, was that finding. This is the fix.
 *
 * It also removes a whole failure class that has already bitten us. Until now the templates
 * in git and the templates Supabase actually sends were two copies of one thing, kept in
 * sync by someone remembering — "one idea must live in one place", broken by construction.
 * `--check` makes the dashboard's copy an assertion instead of a hope.
 *
 * USAGE
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_...  node scripts/push-email-templates.mjs --check
 *   SUPABASE_ACCESS_TOKEN=sbp_...  node scripts/push-email-templates.mjs
 *
 * The token is a Supabase PERSONAL ACCESS TOKEN from
 * https://supabase.com/dashboard/account/tokens — not the anon key, not the service role
 * key. The project ref is read from NEXT_PUBLIC_SUPABASE_URL, or passed as --ref=<ref>.
 *
 * It never prints the token, and it refuses to run against a project ref it was not given
 * explicitly or via env, because "PATCH the auth config of whatever project is handy" is
 * not a thing to guess at.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * file -> the two Management API fields it owns.
 * Subjects live here too: a template and its subject line are one message, and splitting
 * them across two systems is how you end up with a redesigned email titled "Confirm Your
 * Signup" in Supabase's default title case.
 */
const TEMPLATES = [
  {
    file: 'supabase/email/confirm-signup.html',
    contentField: 'mailer_templates_confirmation_content',
    subjectField: 'mailer_subjects_confirmation',
    subject: 'Confirm your email — Enforcee',
  },
  {
    file: 'supabase/email/magic-link.html',
    contentField: 'mailer_templates_magic_link_content',
    subjectField: 'mailer_subjects_magic_link',
    subject: 'Your Enforcee sign-in link',
  },
  {
    file: 'supabase/email/reset-password.html',
    contentField: 'mailer_templates_recovery_content',
    subjectField: 'mailer_subjects_recovery',
    subject: 'Reset your Enforcee password',
  },
  {
    file: 'supabase/email/change-email.html',
    contentField: 'mailer_templates_email_change_content',
    subjectField: 'mailer_subjects_email_change',
    subject: 'Confirm your new email address — Enforcee',
  },
];

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const token = process.env.SUPABASE_ACCESS_TOKEN;

function refFromEnvFile() {
  const p = resolve(ROOT, '.env.local');
  if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL=\s*https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

const ref =
  (args.find((a) => a.startsWith('--ref=')) ?? '').slice(6) ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ||
  refFromEnvFile();

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!token) {
  die(
    'No SUPABASE_ACCESS_TOKEN.\n\n' +
      '  Create one at https://supabase.com/dashboard/account/tokens (name it "enforcee-templates"),\n' +
      '  then:  SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/push-email-templates.mjs --check\n\n' +
      '  This is the personal access token, NOT the anon key and NOT the service role key.'
  );
}
if (!ref) die('No project ref. Pass --ref=<ref>, or set NEXT_PUBLIC_SUPABASE_URL.');

const API = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

/** Whitespace differs harmlessly through the dashboard's own editor; content must not. */
const norm = (s) => (s ?? '').replace(/\r\n/g, '\n').trim();

const local = TEMPLATES.map((t) => {
  const path = resolve(ROOT, t.file);
  if (!existsSync(path)) die(`Missing template: ${t.file}`);
  const html = readFileSync(path, 'utf8');
  // Fail loudly rather than shipping a mail with a dead button. Every auth template
  // depends on this placeholder and Supabase will substitute nothing else for it.
  if (!html.includes('{{ .ConfirmationURL }}')) {
    die(`${t.file} has no {{ .ConfirmationURL }} — that mail would have no working link.`);
  }
  // The bug this project has had three times. Do not let it leave the machine.
  if (/<img[\s\S]*?>/.test(html)) die(`${t.file} contains an <img>. See src/lib/email/notify-templates.ts.`);
  return { ...t, html };
});

const res = await fetch(API, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(20000),
});
if (!res.ok) {
  const body = await res.text().catch(() => '');
  // A network policy that blocks api.supabase.com returns 403 with a plain-text body, which
  // reads exactly like "your token lacks permission" and sends you to rotate a fine token.
  // Verified: this is what the CI sandbox does. Name it instead of guessing.
  if (/not in allowlist|proxy|ENOTFOUND|ECONNREFUSED/i.test(body)) {
    die(
      `Cannot reach api.supabase.com from this machine — this is a NETWORK block, not an auth failure.\n` +
        `  Do not rotate the token. Run this from a machine with plain internet access.\n\n  ${body.slice(0, 200)}`
    );
  }
  die(
    `GET ${res.status} from the Management API.\n` +
      (res.status === 401
        ? '  The token was rejected. Is it a personal access token (sbp_...) and not expired?'
        : res.status === 404
          ? `  Project "${ref}" not found under this token's account.`
          : `  ${body.slice(0, 300)}`)
  );
}
const remote = await res.json();

const drift = local.filter(
  (t) => norm(remote[t.contentField]) !== norm(t.html) || norm(remote[t.subjectField]) !== norm(t.subject)
);

console.log(`\n  project ${ref}\n`);
for (const t of local) {
  const stale = drift.includes(t);
  const empty = !norm(remote[t.contentField]);
  console.log(
    `  ${stale ? (empty ? 'NEVER SET ' : 'STALE     ') : 'in sync   '} ${t.file.replace('supabase/email/', '')}`
  );
}

if (drift.length === 0) {
  console.log('\n  All four templates in Supabase match this repo.\n');
  process.exit(0);
}
if (CHECK) {
  console.log(`\n  ${drift.length} of 4 differ from this repo. Re-run without --check to push.\n`);
  process.exit(1);
}

const body = {};
for (const t of local) {
  body[t.contentField] = t.html;
  body[t.subjectField] = t.subject;
}

const put = await fetch(API, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(20000),
});
if (!put.ok) die(`PATCH ${put.status}: ${(await put.text().catch(() => '')).slice(0, 300)}`);

// Never report a step as done without checking the thing it was supposed to change.
// A 200 from a PATCH is the API's opinion; reading it back is the fact.
const after = await (await fetch(API, { headers: { Authorization: `Bearer ${token}` } })).json();
const stillWrong = local.filter((t) => norm(after[t.contentField]) !== norm(t.html));
if (stillWrong.length) {
  die(`PATCH returned 200 but ${stillWrong.map((t) => t.file).join(', ')} did not change. Nothing was verified.`);
}

console.log(`\n  Pushed and read back: all four templates in Supabase now match this repo.\n`);
