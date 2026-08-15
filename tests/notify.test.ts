import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

describe('the logo renders in Gmail', () => {
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
      it('uses no SVG image — Gmail draws a broken-image glyph', () => {
        expect(html, 'SVG is back in an email').not.toMatch(/image\/svg|\.svg["')]/);
      });

      it('uses no data: URI — Gmail strips them in <img>', () => {
        expect(html, 'a data URI is back in an email').not.toMatch(/src="data:/);
      });

      it('either points at the hosted https PNG or ships no image at all', () => {
        // Under test SITE_URL falls back to localhost (D-025 forbids defaulting to the
        // custom domain), and a localhost src would be a guaranteed broken image in every
        // recipient's inbox. The renderer drops the <img> rather than shipping one.
        const img = (html.match(/<img[^>]*>/) ?? [])[0];
        if (!img) {
          expect(html, 'no logo AND no wordmark').toContain('Enforcee');
          return;
        }
        expect(img).toMatch(/src="https:\/\/[^"]*email-logo\.png"/);
        // Outlook ignores the style and would otherwise draw the source at 168px.
        expect(img).toMatch(/\swidth="28"/);
        expect(img).toMatch(/\sheight="28"/);
        expect(img).toMatch(/alt="Enforcee"/);
      });
    });
  }

  it('the PNG the templates point at actually exists and is a PNG', () => {
    // The check that would have caught this whole class: the asset is real, and it is the
    // format the compatibility table says works.
    const p = join(ROOT, 'public/email-logo.png');
    const bytes = readFileSync(p);
    expect(statSync(p).size).toBeGreaterThan(500);
    // PNG magic number. A renamed SVG would pass a filename check and fail in Gmail.
    expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('names the contact address, not a reply promise', () => {
    for (const [name, html] of templates) {
      expect(html, `${name} lost the contact address`).toContain(`mailto:${CONTACT_EMAIL}`);
      expect(html, `${name} promises a reply noreply@ cannot receive`).not.toMatch(
        /reply to this email/i
      );
    }
  });
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
