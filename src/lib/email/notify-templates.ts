import { CONTACT_EMAIL } from '../contact';

/**
 * The notification emails, as a MODULE rather than files on disk.
 *
 * ── Two production bugs are fixed here, both found by Patrik sending real mail ──
 *
 * (The logo is a third, told in full above `MARK` below. Read that one first if you are
 * here to change the branding — it is the only part of this file that has been wrong three
 * separate times.)
 *
 * 1. THE TEMPLATES DID NOT EXIST AT RUNTIME. They were `.html` files read with
 *    `readFileSync(join(process.cwd(), 'supabase', 'email', …))`. Nothing imports a file
 *    read that way, so Next's file tracer never included it in the deployed function —
 *    verified by grepping every `.nft.json` in `.next/server` for `supabase/email` and
 *    finding zero. On Vercel the read threw ENOENT, `render()` returned null, and
 *    `notify()` reported `template missing` into a log nobody reads. The export ran, the
 *    file downloaded, and the email silently never sent.
 *
 *    A string in a `.ts` file cannot have this problem. It is part of the module graph by
 *    definition, on every host, with no configuration.
 *
 * 2. THE LOGO WAS AN SVG DATA URI, WHICH GMAIL RENDERS AS A BROKEN IMAGE. Both halves of
 *    that choice were wrong and I reasoned my way into each. `<img src="*.svg">` has about
 *    60% support and Gmail is not in it — it draws the broken-image glyph, which is
 *    precisely what he saw. Gmail also strips `data:` URIs in `<img>`, so even a PNG data
 *    URI would have failed.
 *
 *    This paragraph used to end "the only thing that works is a hosted raster at an https
 *    URL". That sentence was written with confidence and was wrong within the hour — the
 *    hosted PNG broke too. It is left here, corrected rather than deleted, because the
 *    mistake it records is the useful part: a compatibility table tells you which formats
 *    a client can draw, and says nothing about whether your server will answer. See `MARK`.
 *
 * Everything else is unchanged and deliberate: inline styles only (Gmail strips `<style>`,
 * Outlook renders through Word), tables not flex, light-mode declared so clients do not
 * auto-invert a warm cream card into a muddy blue one, and no CSS custom properties —
 * which means the site's entire var-based palette is unusable and every colour here is a
 * literal. That duplication is the one place on this project where two copies is correct.
 */

/**
 * The mark is DRAWN, not fetched. There is no <img> in any Enforcee email.
 *
 * THREE image treatments have now failed in Patrik's real inbox, and each one was defended
 * with reasoning that was locally correct:
 *
 *   1. An SVG data URI — so it would render with images blocked and could never drift from
 *      the favicon. Gmail supports neither half: `<img src="*.svg">` is ~60% supported and
 *      Gmail is not in it, and Gmail strips `data:` URIs in images regardless.
 *   2. A hosted SVG. Same format table, same broken-image glyph.
 *   3. A hosted PNG at https://enforcee.com/email-logo.png — the format the compatibility
 *      table actually endorses. It still drew broken, for a reason no compatibility table
 *      could have told me: the asset was committed in the SAME commit as the template, and
 *      the mail had already been sent. The URL was a 404 at the moment it was requested.
 *
 * The third failure is the instructive one. The format was right and the deploy ordering
 * was wrong, which means "pick the correct format" was never the whole problem. ANY
 * fetched image couples this email to a deploy, a DNS answer, a CDN, and the recipient's
 * "display images" setting — four things that can each be false when the mail is opened,
 * none of which a unit test on this repo can observe.
 *
 * So the coupling is removed rather than fixed again. A table cell with a background
 * colour and a letter in it is a mark that renders from the HTML itself: no request, no
 * deploy, no permission, nothing to 404. Outlook's Word engine ignores border-radius and
 * draws a square — that is a square logo, not a broken one, which is the entire point.
 *
 * A side effect worth naming: this module no longer imports SITE_URL at all. The template
 * used to be sensitive to which host built it — the same code produced a working logo on
 * Vercel and a `localhost:3000` broken image anywhere else. It now renders one identical
 * mark from any environment, which is one fewer thing that can differ between the version
 * a test sees and the version a customer opens.
 */
const MARK = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="28" height="28" align="center" valign="middle" bgcolor="#1A1614"
        style="width:28px;height:28px;background:#1A1614;border-radius:7px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:28px;color:#FFFFFF;text-align:center;mso-line-height-rule:exactly;">E</td>
    <td style="padding-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#1A1614;letter-spacing:-0.2px;">Enforcee</td>
  </tr></table>`;

function shell({
  subject,
  preheader,
  heading,
  body,
  footnote,
}: {
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  footnote: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F7F4ED;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F4ED;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E4DED0;border-radius:14px;">

<tr><td style="padding:26px 30px 0 30px;">
  ${MARK}
</td></tr>

<tr><td style="padding:22px 30px 0 30px;">
  <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:25px;line-height:1.2;color:#1A1614;letter-spacing:-0.4px;">${heading}</h1>
</td></tr>

<tr><td style="padding:14px 30px 0 30px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.62;color:#57504A;">
${body}
</td></tr>

<tr><td style="padding:22px 30px 26px 30px;">
  <div style="border-top:1px solid #E4DED0;padding-top:16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6F675F;">
    ${footnote}<br>
    Questions? Write to
    <a href="mailto:${CONTACT_EMAIL}" style="color:#1D4ED8;text-decoration:underline;">${CONTACT_EMAIL}</a> —
    a person reads it. This address does not accept replies.
  </div>
</td></tr>

</table>
<div style="max-width:520px;margin-top:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:#8C8378;">
  Enforcee · every verdict is labelled by method
</div>
</td></tr>
</table>
</body>
</html>`;
}

export type NotifyKind = 'export-ready' | 'account-deleted' | 'subscription-cancelled';

export const SUBJECTS: Record<NotifyKind, string> = {
  'export-ready': 'Your Enforcee data export',
  'account-deleted': 'Your Enforcee account has been deleted',
  'subscription-cancelled': 'Your Enforcee subscription was cancelled',
};

export function renderNotify(kind: NotifyKind, vars: Record<string, string> = {}): string {
  const when = vars.when ?? new Date().toISOString().slice(0, 10);

  switch (kind) {
    case 'export-ready':
      return shell({
        subject: SUBJECTS[kind],
        preheader: 'A copy of everything held against your account.',
        heading: 'Your data export',
        body:
          '<p style="margin:0;">You downloaded a copy of everything held against your account: your email, your subscription state, and the receipts from audits you ran while signed in.</p>' +
          '<p style="margin:12px 0 0 0;">Your source code is not in it, because we never had it.</p>' +
          '<p style="margin:12px 0 0 0;">This message exists so the download leaves a written record. If it was not you, tell us and change your password.</p>',
        footnote: `Requested ${when}.`,
      });

    case 'account-deleted':
      return shell({
        subject: SUBJECTS[kind],
        preheader: 'Done. Nothing is retained.',
        heading: 'Your account is gone',
        body:
          '<p style="margin:0;">Deleted, as you asked. Your account, your subscription record and your stored receipts are removed.</p>' +
          `<p style="margin:12px 0 0 0;">${vars.subscription ?? 'Any active subscription was cancelled at the same time.'}</p>` +
          '<p style="margin:12px 0 0 0;"><strong style="color:#1A1614;">Auditing still works.</strong> The command line and the web audit never needed an account, and nothing about them has changed.</p>' +
          '<p style="margin:12px 0 0 0;">Stripe keeps your invoices and payment history — that is a legal record we cannot delete, and it is what you would use to query a charge. If you are owed part of an unused period, ask and we will refund it.</p>',
        footnote: `Deleted ${when}. This is the last message you will get from us.`,
      });

    case 'subscription-cancelled':
      return shell({
        subject: SUBJECTS[kind],
        preheader: 'Auditing keeps working. It never needed a subscription.',
        heading: 'Subscription cancelled',
        body:
          '<p style="margin:0;">Your plan will not renew. Paid features run to the end of the period you already paid for, and your licence keeps working until it expires.</p>' +
          '<p style="margin:12px 0 0 0;"><strong style="color:#1A1614;">Auditing keeps working, unlimited, forever.</strong> That was never the part you were paying for.</p>' +
          '<p style="margin:12px 0 0 0;">Nothing is deleted by cancelling. Your receipts stay until you ask for them to go.</p>',
        footnote: `Cancelled ${when}.`,
      });
  }
}
