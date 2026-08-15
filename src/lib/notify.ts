import { renderNotify, SUBJECTS, type NotifyKind } from './email/notify-templates';

export type { NotifyKind };

/**
 * Product notifications — the mail that is not an auth flow.
 *
 * Supabase Auth owns sign-in, confirmation and password reset. It does not send "your
 * export is ready" or "your account has been deleted", and those are exactly the moments
 * a user needs a written record: something irreversible just happened and the only
 * evidence is a screen they have already navigated away from.
 *
 * ── This file used to read templates off disk, and that silently broke in production ──
 *
 * `readFileSync(join(process.cwd(), 'supabase', 'email', …))` works locally and does not
 * work on Vercel: nothing imports a path assembled at runtime, so Next's file tracer never
 * bundles it into the deployed function. Confirmed after the fact by grepping every
 * `.nft.json` under `.next/server` for `supabase/email` — zero functions carried them.
 *
 * The failure was invisible in every way that matters. The export downloaded fine, the
 * request returned 200, and `notify()` reported `template missing` into a server log
 * nobody reads. Patrik found it by sending a real email and noticing one never arrived,
 * which is the only thing that could have found it.
 *
 * Templates are an imported module now. A string in a `.ts` file is part of the module
 * graph by definition, on every host, with no configuration. `tests/notify.test.ts` pins
 * that this file performs no filesystem access at all.
 *
 * DEGRADES QUIETLY AND SAYS SO. With no `RESEND_API_KEY` the send is skipped and the
 * reason returned. It must never throw: an email failure cannot fail the deletion the user
 * just asked for, which would leave them believing their data is still held when it is not.
 */

const FROM = process.env.ENFORCEE_MAIL_FROM ?? 'Enforcee <noreply@enforcee.com>';

export async function notify(
  kind: NotifyKind,
  to: string,
  vars: Record<string, string> = {}
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no RESEND_API_KEY configured' };
  if (!to) return { sent: false, reason: 'no recipient' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to,
        subject: SUBJECTS[kind],
        html: renderNotify(kind, vars),
      }),
      // A hung mail provider must not hold a deletion request open.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[notify] ${kind} rejected`, res.status, detail);
      return { sent: false, reason: `provider returned ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[notify] ${kind} failed`, e);
    return { sent: false, reason: 'send failed' };
  }
}
