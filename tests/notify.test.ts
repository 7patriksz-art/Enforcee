import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderNotify, SUBJECTS, type NotifyKind } from '../src/lib/email/notify-templates';
import { CONTACT_EMAIL } from '../src/lib/contact';

/**
 * Two production bugs, both found by Patrik sending real email, neither catchable by any
 * check that existed.
 *
 * ── 1. The templates did not exist at runtime ───────────────────────────────
 *
 * They were `.html` files read with `readFileSync(join(process.cwd(), 'supabase', …))`.
 * That works locally and fails on Vercel: nothing imports a path assembled at runtime, so
 * Next's file tracer never bundles it into the function. Grepping every `.nft.json` under
 * `.next/server` for `supabase/email` returned zero functions.
 *
 * The failure was invisible in every direction. The export downloaded, the request
 * returned 200, and the error went into a log nobody reads. The only symptom was an email
 * that never arrived — which is not a symptom anyone sees unless they are expecting one.
 *
 * ── 2. The logo was an SVG data URI, which Gmail draws as a broken image ─────
 *
 * I picked it so the mark would render with images blocked and could not drift from the
 * favicon. Both halves of the reasoning were right and the format was wrong:
 * `<img src="*.svg">` has ~60% client support and Gmail is not in it, and Gmail strips
 * `data:` URIs in images regardless. Two independent reasons it could never have worked.
 *
 * The lesson is narrow and worth keeping: in email, correctness is a compatibility table,
 * not an argument. Reasoning from first principles about payload size and privacy produced
 * a broken image in the most popular client on earth.
 */

const ROOT = resolve(__dirname, '..');
const KINDS: NotifyKind[] = ['export-ready', 'account-deleted', 'subscription-cancelled'];

describe('notify templates are bundled, not read from disk', () => {
  it('notify.ts performs no filesystem access at all', () => {
    // The property that broke production. A single `readFileSync` here means the mail
    // silently stops sending on any host that does not deploy the whole repo.
    const src = readFileSync(join(ROOT, 'src/lib/notify.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/[^\n]*$/gm, '');
    expect(src, 'notify.ts reads the filesystem again').not.toMatch(
      /readFileSync|node:fs|from 'fs'|process\.cwd\(\)/
    );
  });

  it('no .html file is left in the path the app sends from', () => {
    // A leftover notify-*.html is a second copy that will drift from the module and mislead
    // the next person into editing the one that is not used.
    const files = readdirSync(join(ROOT, 'supabase/email'));
    expect(files.filter((f) => f.startsWith('notify-')), 'stale disk templates').toEqual([]);
  });

  it('renders every kind to real HTML', () => {
    for (const kind of KINDS) {
      const html = renderNotify(kind, { when: '2026-08-15' });
      expect(html, `${kind} did not render`).toContain('<!doctype html>');
      expect(html.length, `${kind} is suspiciously short`).toBeGreaterThan(800);
      expect(SUBJECTS[kind], `${kind} has no subject`).toBeTruthy();
    }
  });

  it('leaves no unsubstituted placeholder', () => {
    // `{{ contact }}` shipping literally to a customer is the module-era version of a
    // button that goes nowhere.
    for (const kind of KINDS) {
      const html = renderNotify(kind, { when: '2026-08-15', subscription: 'x' });
      expect(html, `${kind} has an unfilled placeholder`).not.toMatch(/\{\{|\}\}/);
    }
  });

  it('falls back to a real date when none is passed', () => {
    for (const kind of KINDS) {
      expect(renderNotify(kind)).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

/**
 * ── 3. THE HOSTED PNG DREW BROKEN TOO ───────────────────────────────────────
 *
 * The fix for (2) was a hosted https PNG — the format the compatibility table endorses —
 * and Patrik reported it broken as well. The reason was not the format. `public/email-logo.png`
 * was committed in the SAME commit as the template that points at it, so at the moment his
 * mail was opened that URL was a 404.
 *
 * The tests below USED TO ENFORCE THE MECHANISM: "the src is an https URL ending in
 * email-logo.png, 28x28, with alt text", plus "the PNG exists on disk and has the right
 * magic number". Every one of those passed while the image was broken in his inbox, because
 * every one of them was a statement about this repository and the failure was about the
 * internet. A file being in `public/` is not the same claim as a byte being served.
 *
 * The lesson is the one this product is built on, turned on ourselves: a check that can
 * only see the repo cannot verify a property of the world. Given that, the right move is
 * not a better image check — it is to stop depending on the fetch. So these now enforce the
 * OUTCOME, which is checkable here in full: no Enforcee email contains an <img> at all.
 * The mark is drawn from a table cell, and a table cell cannot 404.
 */
describe('no Enforcee email fetches an image', () => {
  const templates = [
    ...readdirSync(join(ROOT, 'supabase/email'))
      .filter((f) => f.endsWith('.html'))
      .map((f) => [f, readFileSync(join(ROOT, 'supabase/email', f), 'utf8')] as const),
    ...KINDS.map((k) => [`notify:${k}`, renderNotify(k)] as const),
  ];

  it('there are templates of both kinds to check', () => {
    expect(templates.length).toBeGreaterThanOrEqual(7);
  });

  for (const [name, html] of templates) {
    describe(name, () => {
      it('contains no <img> at all', () => {
        // Multiline-safe on purpose. The line-anchored version of this pattern reported
        // "no images" for four templates that each had one — the tag wraps across two
        // lines. A scanner that silently matches nothing is the failure mode in E-3.
        expect(html.match(/<img[\s\S]*?>/g) ?? [], `${name} fetches an image again`).toEqual([]);
      });

      it('references no external asset of any kind', () => {
        // Not just <img>: a background="" attribute or a url() would reintroduce the same
        // coupling to a deploy under a different tag name.
        expect(html, 'an external asset is back').not.toMatch(/background="http|url\(http/);
        expect(html, 'a data URI is back').not.toMatch(/data:image/);
        expect(html, 'SVG is back').not.toMatch(/image\/svg|\.svg["')]/);
      });

      it('still shows a mark and the wordmark', () => {
        // Deleting the image must not quietly delete the branding with it.
        expect(html, `${name} lost the drawn mark`).toMatch(/bgcolor="#1A1614"/);
        expect(html, `${name} lost the wordmark`).toContain('Enforcee');
      });
    });
  }

  it('names the contact address, not a reply promise', () => {
    for (const [name, html] of templates) {
      expect(html, `${name} lost the contact address`).toContain(`mailto:${CONTACT_EMAIL}`);
      expect(html, `${name} promises a reply noreply@ cannot receive`).not.toMatch(
        /reply to this email/i
      );
    }
  });
});

describe('the fallback link is quiet but still readable', () => {
  // "Make the url link more discreet and premium" — Patrik, 2026-08-15. A raw URL shouted
  // in dark monospace is what phishing looks like. But a fallback nobody can read is not a
  // fallback, and the two auth flows that need it most are password reset and magic link,
  // where the button is exactly what a corporate scanner rewrites. So: quieter, and still
  // above 4.5:1 on the card. Both halves are asserted, because softening the colour until
  // it disappears is the obvious way to satisfy "discreet" and break the feature.
  const authTemplates = readdirSync(join(ROOT, 'supabase/email'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f, readFileSync(join(ROOT, 'supabase/email', f), 'utf8')] as const);

  function contrast(hex: string, on = '#FFFFFF'): number {
    const lum = (h: string) => {
      const c = [1, 3, 5]
        .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const [hi, lo] = [lum(hex), lum(on)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  }

  it('there are auth templates to check', () => {
    expect(authTemplates.length).toBe(4);
  });

  for (const [name, html] of authTemplates) {
    describe(name, () => {
      it('still carries the pasteable URL', () => {
        expect(html, 'the fallback link is gone').toMatch(/Or paste this link/i);
        // Twice: once in the button href, once as text. If it only appears once, the
        // fallback was deleted rather than restyled.
        expect((html.match(/\{\{ \.ConfirmationURL \}\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
      });

      it('keeps the fallback as plain text, not a second <a>', () => {
        // The scanner that rewrites the button rewrites an <a> here identically, which
        // would leave the mail with no working path at all — the one case this exists for.
        const block = html.slice(html.indexOf('Or paste this link'));
        const upToFooter = block.slice(0, block.indexOf('</td></tr>'));
        expect(upToFooter, 'the fallback became a link and can be rewritten too').not.toMatch(/<a\s/);
      });

      it('reads at 4.5:1 or better despite being discreet', () => {
        const block = html.slice(html.indexOf('Or paste this link'));
        const colours = [...block.slice(0, 900).matchAll(/color:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
        expect(colours.length, 'no colours found — the selector missed').toBeGreaterThan(0);
        for (const c of colours) {
          expect(contrast(c), `${name}: ${c} is ${contrast(c).toFixed(2)}:1, unreadable`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it('is quieter than the body copy it sits under', () => {
        // The point of the change. #57504A body text is 7.9:1; the fallback must recede.
        const block = html.slice(html.indexOf('Or paste this link'));
        const urlColour = (block.match(/monospace;font-size:[\d.]+px;line-height:[\d.]+;color:(#[0-9A-Fa-f]{6})/) ?? [])[1];
        expect(urlColour, 'could not find the URL colour').toBeTruthy();
        expect(contrast(urlColour!)).toBeLessThan(contrast('#57504A'));
      });
    });
  }
});

describe('the UI never claims an email was sent without checking', () => {
  const ui = readFileSync(join(ROOT, 'src/app/account/DataActions.tsx'), 'utf8');
  const exportRoute = readFileSync(join(ROOT, 'src/app/api/account/export/route.ts'), 'utf8');
  const deleteRoute = readFileSync(join(ROOT, 'src/app/api/account/delete/route.ts'), 'utf8');

  it('the export awaits the send rather than firing and forgetting', () => {
    // `void notify(...)` meant nobody — not the user, not us — could tell whether the mail
    // went. It hid a real production failure for a day.
    expect(exportRoute, 'the send is fire-and-forget again').not.toMatch(/void notify\(/);
    expect(exportRoute).toMatch(/await notify\(/);
  });

  it('the export reports the outcome to the browser', () => {
    expect(exportRoute).toContain('x-enforcee-notified');
    // Without exposing it, a same-origin fetch cannot read the header and the UI silently
    // falls back to "no email sent" for a send that worked.
    expect(exportRoute, 'the header is set but not readable').toContain(
      'access-control-expose-headers'
    );
  });

  it('deletion reports whether its final message was sent', () => {
    expect(deleteRoute).toMatch(/await notify\(/);
    expect(deleteRoute).toContain('emailed');
  });

  it('the UI branches on the real result', () => {
    expect(ui).toContain("x-enforcee-notified");
    expect(ui).toMatch(/No confirmation email was sent/);
    // The unconditional claim that shipped.
    const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
    expect(code, 'the UI asserts an inbox delivery it did not verify').not.toMatch(
      /setNote\(\s*'[^']*in your inbox[^']*'\s*\)/
    );
  });
});
