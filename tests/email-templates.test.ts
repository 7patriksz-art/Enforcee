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

/**
 * Two families, and they are placeholder-incompatible.
 *
 * AUTH templates are pasted into the Supabase dashboard and Supabase fills
 * `{{ .ConfirmationURL }}`. NOTIFY templates are rendered by src/lib/notify.ts, which
 * fills `{{ contact }}` and friends — they carry no confirmation link because there is
 * nothing to confirm; they are a record that something already happened.
 *
 * Asserting one family's rules against the other is how this suite first went red. The
 * shared rules — preheader, no external image, light-mode declared, no CSS variables —
 * apply to every template regardless of who renders it.
 */
const AUTH = FILES.filter((f) => !f.startsWith('notify-'));
const NOTIFY = FILES.filter((f) => f.startsWith('notify-'));

describe('email templates', () => {
  it('there are templates of both kinds to check', () => {
    // The scan's own control. An empty directory passes every assertion below it.
    expect(AUTH.sort()).toEqual([
      'change-email.html',
      'confirm-signup.html',
      'magic-link.html',
      'reset-password.html',
    ]);
    expect(NOTIFY.sort()).toEqual([
      'notify-account-deleted.html',
      'notify-export-ready.html',
      'notify-subscription-cancelled.html',
    ]);
  });

  for (const f of AUTH) {
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

      it('prints the contact address as a reachable link', () => {
        // The footer used to say "reply to this email — it reaches a person". The sender
        // is noreply@, which by convention accepts nothing, and there is no dashboard
        // setting to redirect it — so that sentence was a promise the product could not
        // keep. The address is now in the body, where it needs no configuration at all.
        expect(html, 'no mailto link to the contact address').toContain(`mailto:${CONTACT_EMAIL}`);
        expect(html, 'still promises a reply the sender cannot receive').not.toMatch(
          /reply to this email/i
        );
      });

      it('names no address other than the current contact one', () => {
        for (const m of html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
          expect(m).toBe(CONTACT_EMAIL);
        }
      });
    });
  }

  for (const f of NOTIFY) {
    const html = readFileSync(join(DIR, f), 'utf8');

    describe(f, () => {
      it('carries the placeholder its own renderer fills', () => {
        // notify.ts substitutes `{{ contact }}`. A template that lost it would ship the
        // literal braces to a customer, which is the notify-family equivalent of a
        // button that goes nowhere.
        expect(html).toContain('{{ contact }}');
      });

      it('carries NO Supabase confirmation link', () => {
        // These are records of something that already happened. A confirmation link in
        // one would be an unactionable button on an irreversible event.
        expect(html).not.toContain('.ConfirmationURL');
      });

      it('is rendered by notify.ts, so the kind is wired up', () => {
        const notify = readFileSync(resolve(__dirname, '../src/lib/notify.ts'), 'utf8');
        const kind = f.replace(/^notify-|\.html$/g, '');
        expect(notify, `${f} exists but nothing sends it`).toContain(`'${kind}'`);
      });
    });
  }

  it('every template is documented with the Supabase screen it belongs on', () => {
    const readme = readFileSync(join(DIR, 'README.md'), 'utf8');
    for (const f of AUTH) expect(readme, `${f} is undocumented`).toContain(f);
  });

  /**
   * The instructions must state their own preconditions, BEFORE the steps.
   *
   * The first version of this README said "paste each into Supabase → Authentication →
   * Emails" and stopped. It never mentioned that Supabase's built-in sender is capped at
   * two messages an hour and cannot send from a custom address — so following it exactly
   * produces a beautiful email that reaches almost nobody, from an address that is not
   * ours, and the failure looks like nothing happening at all.
   *
   * That is exactly what `enforcee preflight` exists to catch: a step is worthless if the
   * thing it depends on is not there, because it returns nothing and nothing is
   * indistinguishable from a clean result. We shipped it in our own documentation, and
   * Patrik caught it rather than a test. So it becomes a test.
   */
  it('the README states its preconditions BEFORE its steps', () => {
    const readme = readFileSync(join(DIR, 'README.md'), 'utf8');

    const preconditions = readme.search(/##\s*STOP/i);
    const paste = readme.search(/Authentication\s*→\s*Emails/i);
    expect(preconditions, 'no preconditions section').toBeGreaterThan(-1);
    expect(paste, 'no paste step to order against').toBeGreaterThan(-1);
    expect(
      preconditions,
      'the preconditions must come before the step that depends on them'
    ).toBeLessThan(paste);

    // The three that actually block, each named rather than gestured at.
    expect(readme, 'must name the SMTP requirement').toMatch(/custom SMTP/i);
    expect(readme, 'must state the built-in rate limit').toMatch(/2 messages per hour/i);
    // NOT a Reply-To row. That precondition was fabricated: Supabase's SMTP settings
    // expose only sender name and address, and Resend's Reply-To is a per-message API
    // field. What must be true instead is that the templates carry the address themselves.

    // No step may describe a screen that does not exist. Two were invented in this file
    // — an SMTP precondition that was missing entirely, then a "Resend → Settings →
    // Reply-To" that has never existed. Both were written from memory of a dashboard
    // rather than from its documentation, and both were found by Patrik trying to follow
    // them. Every surviving step now cites the page it came from.
    const steps = readme.slice(readme.search(/### 1\./));
    expect(steps, 'the setup steps must cite their source docs').toMatch(/resend\.com\/docs|supabase\.com\/docs/);

    // And a verification step, because a dashboard reporting "sent" is not a control.
    expect(readme, 'must tell the reader to check a real inbox').toMatch(/Prove it works|check the inbox/i);
  });
});

describe('rules that apply to every template, whoever renders it', () => {
  for (const f of FILES) {
    const html = readFileSync(join(DIR, f), 'utf8');
    describe(f, () => {
      it('has a preheader', () => {
        expect(html).toMatch(/display:none;max-height:0/);
      });
      it('requests no external resource', () => {
        const remote = html.match(/(?:src|href)="https?:\/\/(?!enforcee)[^"]*"/g) ?? [];
        expect(remote, `remote resources: ${remote.join(', ')}`).toEqual([]);
        expect(html).toContain('data:image/svg+xml;base64,');
      });
      it('declares light mode', () => {
        expect(html).toContain('content="light"');
      });
      it('carries no CSS custom properties and no <style> block', () => {
        expect(html).not.toMatch(/var\(--/);
        expect(html).not.toMatch(/<style[\s>]/i);
      });
      it('never promises a reply the sender cannot receive', () => {
        expect(html).not.toMatch(/reply to this email/i);
      });
    });
  }
});
