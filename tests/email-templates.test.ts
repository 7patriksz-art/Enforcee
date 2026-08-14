import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONTACT_EMAIL } from '../src/lib/contact';

/**
 * Transactional email is the surface with the worst feedback loop on the whole product.
 *
 * If the site breaks, someone sees it. If a sign-in email breaks, the user cannot sign in,
 * cannot tell us, and the only evidence is an account that never activates — a failure that
 * looks exactly like disinterest. So the ways these rot get a control each, because nothing
 * else will ever notice.
 */

const DIR = resolve(__dirname, '../supabase/email');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.html'));

describe('email templates', () => {
  it('there are templates to check', () => {
    // The scan's own control. An empty directory passes every assertion below it.
    expect(FILES.sort()).toEqual([
      'change-email.html',
      'confirm-signup.html',
      'magic-link.html',
      'reset-password.html',
    ]);
  });

  for (const f of FILES) {
    const html = readFileSync(join(DIR, f), 'utf8');

    describe(f, () => {
      it('keeps the Supabase placeholder intact', () => {
        // The single point of failure. A template that renders beautifully and has lost
        // `{{ .ConfirmationURL }}` sends a mail with a button that goes nowhere, and every
        // recipient is locked out with no way to say so.
        expect(html).toContain('{{ .ConfirmationURL }}');
      });

      it('offers the link as plain text as well as a button', () => {
        // Corporate scanners rewrite hrefs and some clients drop styled anchors. Two
        // occurrences: one in the button, one copy-pasteable.
        const hits = html.match(/\{\{ \.ConfirmationURL \}\}/g) ?? [];
        expect(hits.length, 'the link appears only once — no fallback').toBeGreaterThanOrEqual(2);
      });

      it('has a preheader, so the inbox preview is not brand noise', () => {
        expect(html).toMatch(/display:none;max-height:0/);
      });

      it('requests no external resource', () => {
        // An external <img> is a tracking pixel by another name, breaks with images
        // blocked, and would let the mark drift from the site favicon.
        const remote = html.match(/(?:src|href)="https?:\/\/(?!enforcee)[^"]*"/g) ?? [];
        expect(remote, `remote resources: ${remote.join(', ')}`).toEqual([]);
        expect(html).toContain('data:image/svg+xml;base64,');
      });

      it('declares light mode rather than letting clients invert it', () => {
        expect(html).toContain('content="light"');
      });

      it('carries no CSS custom properties, which no mail client supports', () => {
        // The site's palette is entirely var()-based, so copying a class or a colour
        // across from a page is the natural mistake — and it renders as black-on-black.
        expect(html).not.toMatch(/var\(--/);
      });

      it('inlines its styles instead of using a <style> block Gmail will strip', () => {
        expect(html).not.toMatch(/<style[\s>]/i);
      });

      it('names no address other than the current contact one', () => {
        for (const m of html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
          expect(m).toBe(CONTACT_EMAIL);
        }
      });
    });
  }

  it('every template is documented with the Supabase screen it belongs on', () => {
    const readme = readFileSync(join(DIR, 'README.md'), 'utf8');
    for (const f of FILES) expect(readme, `${f} is undocumented`).toContain(f);
  });
});
