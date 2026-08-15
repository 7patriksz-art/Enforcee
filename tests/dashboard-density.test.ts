import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * Every word must earn its place.
 *
 * The dashboard had four navigation rows each carrying a second line that restated the word
 * above it — "Billing / Invoices and payment" — plus an eyebrow reading "account" directly
 * above a heading reading "Your account", above a sentence listing the four things the nav
 * already listed. Three ways of saying the same thing before any content appeared.
 *
 * None of it was wrong, which is exactly why it accumulated. Explanatory prose is the
 * easiest thing in the world to add and the hardest to notice, because every individual
 * sentence is defensible and only the total is the problem. A settings screen is read by
 * someone who arrived to do ONE thing; sentences between them and it are a tax.
 *
 * So the budget is a test. It is a blunt instrument on purpose — a precise one would be
 * argued with.
 */

const ROOT = resolve(__dirname, '..');
const ACCOUNT = join(ROOT, 'src', 'app', 'account');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}
const files = walk(ACCOUNT);

/** Visible copy: JSX text nodes and quoted strings, minus code and comments. */
function prose(src: string): string[] {
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const out: string[] = [];
  // Text between tags.
  for (const m of body.matchAll(/>([^<>{}]{20,})</g)) out.push(m[1].trim());
  // Quoted strings long enough to be a sentence rather than a class name or a key.
  for (const m of body.matchAll(/'([A-Z][^']{28,})'/g)) out.push(m[1].trim());
  return out.filter((t) => /[a-z]{3}/.test(t));
}

describe('the dashboard stays dense', () => {
  it('found the account screens', () => {
    // Coverage control: an empty walk passes every budget below it.
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.some((f) => f.endsWith('AccountNav.tsx'))).toBe(true);
  });

  it('the nav rows carry no second line', () => {
    const nav = readFileSync(join(ACCOUNT, 'AccountNav.tsx'), 'utf8');
    // `hint` was the field. Its absence is the whole point of this test — a future session
    // adding "just a short description" to each row is the exact regression.
    expect(nav, 'a per-row hint is back on the account nav').not.toMatch(/\bhint:/);
  });

  it('every nav row has an icon instead', () => {
    // Comments stripped: the doc comment above explains why the glyphs are aria-hidden,
    // and counting that sentence as a fifth icon is the check measuring its own prose.
    const nav = readFileSync(join(ACCOUNT, 'AccountNav.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/[^\n]*$/gm, '');
    const rows = (nav.match(/href: '\/account/g) ?? []).length;
    const icons = (nav.match(/<svg/g) ?? []).length;
    expect(rows).toBeGreaterThanOrEqual(4);
    expect(icons, 'a nav row is missing its icon').toBe(rows);
    // Decorative: the label is right beside it, so announcing the glyph is noise.
    expect((nav.match(/aria-hidden/g) ?? []).length).toBe(icons);
  });

  it('the shell does not introduce itself three times', () => {
    const layout = readFileSync(join(ACCOUNT, 'layout.tsx'), 'utf8');
    const body = layout.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).toContain('Your account');
    // An eyebrow reading "account" above a heading reading "Your account".
    expect(body, 'the eyebrow is back above a heading that says the same').not.toMatch(
      />account</
    );
    // ZERO, not one. Set to 1 first, which allowed exactly the paragraph that had just
    // been deleted — the assertion passed against a deliberately reverted layout. Fifth
    // control on this project that could not have failed. "Your account" is 12 characters
    // and falls under prose()'s 20-char floor, so the heading is not being counted here.
    expect(prose(body), `the shell has prose again: ${prose(body).join(' | ')}`).toEqual([]);
  });

  it('no single line of dashboard copy runs past 22 words', () => {
    const long: string[] = [];
    for (const f of files) {
      for (const t of prose(readFileSync(f, 'utf8'))) {
        const words = t.split(/\s+/).filter(Boolean).length;
        if (words > 22) long.push(`${relative(ROOT, f)}: "${t.slice(0, 70)}…" (${words} words)`);
      }
    }
    expect(long, `sentences too long:\n  ${long.join('\n  ')}`).toEqual([]);
  });

  it('the whole dashboard stays under a total word budget', () => {
    // The number that actually matters. Individual sentences can all be short and the
    // screen still be a wall, which is what happened.
    const total = files
      .flatMap((f) => prose(readFileSync(f, 'utf8')))
      .reduce((n, t) => n + t.split(/\s+/).filter(Boolean).length, 0);
    expect(total, `dashboard copy is ${total} words`).toBeLessThanOrEqual(320);
  });
});

describe('the account is reachable', () => {
  it('the header carries an account link', () => {
    const layout = readFileSync(join(ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout, 'no way into the dashboard from the site').toContain('<AccountIcon');
  });

  it('the icon does not make every page dynamic', () => {
    // Reading auth in the root layout would opt the whole site out of static rendering to
    // render one 32px glyph. The icon resolves its own state on the client instead.
    const icon = readFileSync(join(ROOT, 'src', 'components', 'AccountIcon.tsx'), 'utf8');
    expect(icon.trimStart().startsWith("'use client'")).toBe(true);
    const layout = readFileSync(join(ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout, 'the root layout now reads auth').not.toMatch(/getAccess|getUser\(/);
  });

  it('announces whether you are signed in', () => {
    const icon = readFileSync(join(ROOT, 'src', 'components', 'AccountIcon.tsx'), 'utf8');
    // The glyph-vs-initial difference is invisible to a screen reader.
    expect(icon).toMatch(/aria-label=\{email \?/);
  });
});
