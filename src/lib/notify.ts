import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTACT_EMAIL } from './contact';

/**
 * Product notifications — the mail that is not an auth flow.
 *
 * Supabase Auth owns sign-in, confirmation and password reset, and its templates live in
 * its dashboard. It does not send "your export is ready" or "your account has been
 * deleted", and those are precisely the moments a user needs a written record: something
 * irreversible just happened to their account and the only evidence is a screen they have
 * already navigated away from.
 *
 * DEGRADES QUIETLY AND SAYS SO. With no `RESEND_API_KEY` the send is skipped and logged,
 * and the caller is told it did not send. It must never throw: an email failure cannot be
 * allowed to fail the deletion the user just asked for — that would leave them believing
 * their data is still held when it is not, which is the worse of the two errors by a wide
 * margin.
 */

const FROM = process.env.ENFORCEE_MAIL_FROM ?? `Enforcee <noreply@enforcee.com>`;

export type NotifyKind = 'export-ready' | 'account-deleted' | 'subscription-cancelled';

const SUBJECTS: Record<NotifyKind, string> = {
  'export-ready': 'Your Enforcee data export',
  'account-deleted': 'Your Enforcee account has been deleted',
  'subscription-cancelled': 'Your Enforcee subscription was cancelled',
};

/** Read a template off disk and fill `{{ key }}` placeholders. */
function render(kind: NotifyKind, vars: Record<string, string>): string | null {
  try {
    // Templates ship in the repo rather than being inlined here, so the same file can be
    // opened in a browser and reviewed like any other design surface.
    const path = join(process.cwd(), 'supabase', 'email', `notify-${kind}.html`);
    let html = readFileSync(path, 'utf8');
    for (const [k, v] of Object.entries({ ...vars, contact: CONTACT_EMAIL })) {
      html = html.replaceAll(`{{ ${k} }}`, v);
    }
    return html;
  } catch (e) {
    console.error(`[notify] template notify-${kind}.html unavailable`, e);
    return null;
  }
}

export async function notify(
  kind: NotifyKind,
  to: string,
  vars: Record<string, string> = {}
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no RESEND_API_KEY configured' };
  if (!to) return { sent: false, reason: 'no recipient' };

  const html = render(kind, vars);
  if (!html) return { sent: false, reason: 'template missing' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject: SUBJECTS[kind], html }),
      // A hung mail provider must not hold a deletion request open.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[notify] ${kind} rejected`, res.status, await res.text().catch(() => ''));
      return { sent: false, reason: `provider returned ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[notify] ${kind} failed`, e);
    return { sent: false, reason: 'send failed' };
  }
}
