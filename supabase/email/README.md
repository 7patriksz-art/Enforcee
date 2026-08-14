# Transactional email templates

## STOP — check these before pasting anything

**These templates do not work on a fresh Supabase project.** Pasting them in and stopping
gets you a beautiful email that reaches almost nobody, from an address that is not yours.

This section exists because the first version of this file went straight to "paste each into
Supabase" without checking what that step assumes. That is precisely the failure
`enforcee preflight` was built to catch — *a rule that tells you to run a tool is worthless
if the tool is not installed, because the command returns nothing and nothing is
indistinguishable from a clean result.* Shipping the same mistake in our own documentation is
worth recording rather than quietly fixing.

| Precondition | Why | Status |
|---|---|---|
| **Custom SMTP configured** | Supabase's built-in sender is capped at **2 messages per hour** and Supabase says it is for *"toy projects, demos or any non-mission-critical application"* — they *"urge all customers to set up custom SMTP server for all other use cases"*. Without it, the third person to sign up in an hour silently gets nothing. | ☐ |
| **A sending domain you control** | The built-in service sends from a Supabase address. You cannot set the sender without SMTP, so the branding in these templates sits under someone else's From line. | ☐ |
| ~~A Reply-To that reaches a person~~ | **Removed — this row was wrong.** Supabase's SMTP settings expose only sender name and address, and Resend's Reply-To is a per-message API field, not a dashboard setting. There is no screen to do this on. The templates now print the contact address as a link in the body instead, so nothing needs configuring. | n/a |

Source for the quotes and the 2/hour figure: [Supabase — Send emails with custom
SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

---

## Setting up SMTP — the path that fits this project

**You already own `enforcee.com`, and that is the whole answer.** A sending domain needs DNS
records, **not a mailbox** — so `noreply@enforcee.com` can send even though no inbox exists
there and you cannot create one. Replies go to your real address via Reply-To.

Free tier is enough by a wide margin: **100 emails/day, 3,000/month**
([Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)) against
a product that currently has no users.

### 1. Verify the domain

1. Sign up at **resend.com**. No card.
2. **Domains → Add Domain →** `enforcee.com`.
3. It shows three DNS records — a `TXT` (DKIM), an `MX` and a `TXT` (SPF) for a `send`
   subdomain.
4. Add them wherever `enforcee.com`'s DNS lives. If the nameservers point at Vercel:
   **Vercel → your project → Settings → Domains → enforcee.com → DNS Records → Add**. If they
   are still at the registrar, add them there instead.
5. Back in Resend, press **Verify**. Usually a few minutes; DNS can take longer.

> **Do not skip to step 2 while it says Pending.** An unverified domain fails at send time,
> and the failure surfaces as "the user never got the email" — the same shape as no template
> at all, which is what makes it expensive to diagnose.

### 2. Create the API key

**API Keys → Create API Key**, permission **Sending access**. Copy it once; it is not shown
again. This is a credential — it goes in Supabase and nowhere else. Never in the repo.

### 3. Point Supabase at it

**Supabase → Project Settings → Authentication → SMTP Settings → Enable Custom SMTP:**

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | `noreply@enforcee.com` |
| Sender name | `Enforcee` |

([Resend — SMTP](https://resend.com/docs/send-with-smtp): host, username and the ports are
quoted from there; `465` is implicit TLS.)

Then **Authentication → Rate Limits** and raise the email limit — it is still pinned to the
built-in service's default until you change it.

### 4. ~~Set Reply-To~~ — there is no such step

**This step was wrong and has been removed.** It said "Resend → Settings → Reply-To". No
such screen exists: Resend sets Reply-To per message via an API field, and Supabase's SMTP
settings expose only sender name and sender email. Following it was impossible, which is how
Patrik found it.

Second fabricated precondition in this one file. The rule it breaks is already written down —
*verify that a recommended fix is executable before recommending it* — and it was broken by
describing a dashboard from memory rather than opening the docs.

**No configuration replaces it.** The templates now print the contact address as a `mailto:`
link in the footer and say plainly that the sending address does not accept replies. The
promise is kept by the message itself rather than by a header, which means there is nothing
left to get wrong.

### 5. Paste the templates

**Supabase → Authentication → Emails**, then match file to template:

| File | Supabase template |
|---|---|
| `confirm-signup.html` | Confirm signup |
| `magic-link.html` | Magic Link |
| `reset-password.html` | Reset Password |
| `change-email.html` | Change Email Address |

### 6. Prove it works, rather than assuming

Trigger a real sign-up with an address you can read. Confirm you received it, that the From
line reads `Enforcee <noreply@enforcee.com>`, that the button works, and that a reply lands
in the right inbox. **A control that could not have failed is not a control** — check the
inbox, not the dashboard's "sent" count.

---

## Why the templates look the way they do

**Everything is inline and table-based.** Email is not the web. Gmail strips `<style>`
blocks, Outlook renders through Word's HTML engine, and no client supports CSS custom
properties — so the site's variables cannot be used and every colour here is a literal. That
duplication is deliberate and is the one place on this project where two copies of a value is
the correct answer.

**Light mode only, declared.** `color-scheme: light` and `supported-color-schemes: light`.
A dark-mode email is worse than none, because several clients auto-invert instead of honouring
your styles and turn a warm cream card into a muddy blue-grey one.

**The logo is a base64 `data:` URI.** No external request, so it renders with images blocked
and there is no tracking-pixel-shaped hole where the brand should be. Same 404-byte SVG as the
site favicon, so the mark cannot drift.

**The link appears twice** — once as a button, once as plain text. Corporate scanners rewrite
`href` targets and some clients refuse to render a styled anchor. Without the plain copy those
users get a dead end, and the only signal is a support email we cannot answer.

**Each has a preheader** — the grey line the inbox shows next to the subject. Left empty it
fills with whatever text comes first, which on a branded template is the word "Enforcee"
repeated.

## What is deliberately absent

No tracking pixel, no open-rate beacon, no click-wrapped links, no unsubscribe footer. These
are transactional — you cannot unsubscribe from your own sign-in link, and offering to is a
dark pattern. A product selling verifiable behaviour does not measure whether you opened an
email.

## Preview one locally

```bash
node -e "const f=require('fs');process.stdout.write(f.readFileSync('supabase/email/magic-link.html','utf8').replaceAll('{{ .ConfirmationURL }}','https://example.test/x'))" > /tmp/preview.html
```

`tests/email-templates.test.ts` checks every template still carries its placeholder, its
preheader, the plain-text fallback and no external image — and that this file still states its
preconditions before its steps.
