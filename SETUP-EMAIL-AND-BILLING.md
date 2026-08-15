# Turning on email and the billing actions

Exact clicks, in order. **Do not skip ahead** — step 3 needs the key from step 2, and
steps 5–7 do nothing until step 4 is saved.

Time: about 15 minutes, most of it waiting for DNS.

---

## Before you start

You need, open in tabs:

- **resend.com** — sign up, no card
- **supabase.com/dashboard** → your Enforcee project
- **vercel.com** → your Enforcee project
- Wherever `enforcee.com`'s DNS lives (Vercel if the nameservers point there)

---

## Step 1 — Verify enforcee.com in Resend

1. **resend.com** → sign up / log in.
2. Left sidebar → **Domains** → **Add Domain**.
3. Type `enforcee.com`. Region: pick the closest one. → **Add**.
4. Resend shows a table of DNS records — one `MX` and two `TXT`.
5. Open your DNS. If nameservers point at Vercel: **Vercel → your project → Settings →
   Domains → enforcee.com → DNS Records**. Otherwise your registrar's DNS page.
6. Add each row from Resend exactly. Copy-paste the values; do not retype them.
   - If your DNS asks for a "Name"/"Host" and Resend shows `send.enforcee.com`, enter
     `send` — most panels append the domain automatically. If you end up with
     `send.enforcee.com.enforcee.com`, that is what happened.
7. Back in Resend → **Verify**.
8. Wait for all three rows to read **Verified**. Usually 2–10 minutes.

> **Do not continue while it says Pending.** An unverified domain fails at send time, and
> the failure looks like "the user never got the email" — the same symptom as no setup at
> all, which is what makes it expensive to diagnose.

## Step 2 — Create the API key

1. Resend → left sidebar → **API Keys** → **Create API Key**.
2. Name: `enforcee-production`. Permission: **Sending access**. Domain: `enforcee.com`.
3. → **Add**. **Copy the key now** — it is shown once.
4. Paste it somewhere temporary. It goes into two places below, then delete your copy.

## Step 3 — Point Supabase at Resend (this is what makes auth email work)

1. Supabase → your project → **Project Settings** (gear, bottom left) → **Authentication**.
2. Scroll to **SMTP Settings** → toggle **Enable Custom SMTP** on.
3. Fill in exactly:

   | Field | Value |
   |---|---|
   | Sender email | `noreply@enforcee.com` |
   | Sender name | `Enforcee` |
   | Host | `smtp.resend.com` |
   | Port number | `465` |
   | Username | `resend` |
   | Password | the API key from step 2 |

4. **Save**.
5. Still on that page → **Rate Limits** → raise **Emails per hour** from `2` to something
   real, e.g. `100`. It is still pinned to the built-in service's default until you change
   it, and 2/hour will silently drop your third signup.

## Step 4 — Put the key in Vercel (this is what makes the account actions email)

Supabase sends auth mail. The app sends its own notifications — export, deletion — and
needs the key separately.

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add:

   | Key | Value | Environments |
   |---|---|---|
   | `RESEND_API_KEY` | the same key from step 2 | Production, Preview, Development |

3. Optional, only if you ever want a different From line:
   `ENFORCEE_MAIL_FROM` = `Enforcee <noreply@enforcee.com>`
4. → **Save**.
5. **Redeploy.** Environment variables are read at build time — the existing deployment
   will not pick it up. **Deployments → the top one → ⋯ → Redeploy.**

Now delete your temporary copy of the key.

## Step 5 — Enable the Stripe Billing Portal

The **Manage or cancel** button on `/account/billing` opens Stripe's own portal. It does
nothing until the portal is configured once.

1. **dashboard.stripe.com** → make sure you are in **live mode** (toggle, top right).
2. Search for **Customer portal**, or go to Settings → Billing → **Customer portal**.
3. Turn on:
   - **Customers can cancel subscriptions** → *Immediately* or *At end of period*, your call
   - **Customers can update payment methods**
   - **Invoice history**
4. Business information: set your **Terms of service** and **Privacy policy** URLs to
   `https://enforcee.com/terms` and `https://enforcee.com/privacy`.
5. → **Save changes**.

## Step 6 — Paste the four auth templates

**Only these four.** Supabase → **Authentication** → **Emails**.

| Paste this file | Into this template |
|---|---|
| `supabase/email/confirm-signup.html` | Confirm signup |
| `supabase/email/magic-link.html` | Magic Link |
| `supabase/email/reset-password.html` | Reset Password |
| `supabase/email/change-email.html` | Change Email Address |

For each: open the template, switch the editor to **source/HTML**, select all, paste, save.

**There are only four templates to paste.** The account notifications — export, deletion —
are generated in code (`src/lib/email/notify-templates.ts`) and sent by the app using the
key from step 4. They were `.html` files briefly; that was a bug, because a file read at
runtime is never bundled into a Vercel function and the mail silently never sent.

## Step 7 — Prove it works, rather than assuming

Do all four. A dashboard saying "sent" is not a control.

1. **Sign up** with an address you can read. Confirm the mail arrives, the From line reads
   `Enforcee <noreply@enforcee.com>`, and the button signs you in.
2. **Download my data** on `/account/data`. Confirm a `.json` file downloads *and* an
   email arrives.
3. **Manage or cancel** on `/account/billing`. Confirm Stripe's portal opens. (Needs a
   subscription on that account; a free account correctly says there is no billing record.)
4. **Check the logo renders.** It is a hosted PNG now. It was an SVG data URI, which Gmail
   draws as a broken-image glyph — that was the broken favicon.
5. **Check spam** for all of the above. If they land there, add a DMARC record —
   Resend → Domains → your domain suggests one.

If the export downloads but says *"No confirmation email was sent"*, `RESEND_API_KEY` is
missing from Vercel or the deployment predates it. Re-check step 4, including the redeploy.
The page now tells you which happened instead of claiming an inbox delivery it did not make.

---

## What happens when someone deletes their account

Worth knowing, because it is the part that would otherwise become a chargeback:

1. The app reads their Stripe subscription id **before** deleting anything.
2. It **cancels the subscription in Stripe**, immediately.
3. Only if that succeeds does it delete their rows and their login.
4. If cancellation fails, **nothing is deleted** and they are told to cancel in Billing first.

So there is no state where the login is gone and the card is still being charged. If you
ever want to refund the unused part of a period, do it in Stripe → the customer → the
payment → **Refund**; the deletion email already tells them to ask.

Stripe keeps the customer, invoices and payment history through all of this. That is
deliberate: it is what a dispute is defended with, and what tax law requires you keep.
