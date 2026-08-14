import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { CONTACT_EMAIL } from '../src/lib/contact';

/**
 * The contact address lives in one place, and nothing may hardcode another one.
 *
 * This is not tidiness. `CONTACT_EMAIL` is cited in the Privacy Policy as the
 * data-subject contact and in the Terms as the vulnerability-report address — those are
 * commitments to a reader. When the address moved, every surface that imported the token
 * moved with it and the LICENSE did not, because it is a text file nobody greps. It kept
 * pointing at `hello@enforcee.app`, a domain that has never been registered, inside a legal
 * document, for the entire life of the project.
 *
 * "Seven places were fixed" was true. It was eight.
 */

const ROOT = resolve(__dirname, '..');

/** Any address that is not the current contact address, ignoring the ones that should be. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Addresses that legitimately are not ours.
const ALLOWED = new Set([
  CONTACT_EMAIL,
  'noreply@anthropic.com', // git trailer
  'support@anthropic.com',
]);

/**
 * `example.com`, `example.org` and `example.net` are reserved by RFC 2606 precisely so they
 * can be used as placeholders that provably reach nobody. Form placeholders and test
 * fixtures use them correctly and are not findings — excluding them is what keeps this
 * check's signal at 100%, and a check that cries wolf gets deleted.
 */
const RESERVED = /@example\.(com|org|net|co)\b/i;

/**
 * The two files that legitimately WRITE the address down: the token itself, and this test.
 * Both quote the dead `hello@enforcee.app` in prose explaining why it was dead — excluding
 * them is the difference between a check that documents history and one that forbids
 * documenting it.
 */
const SELF = [join('src', 'lib', 'contact.ts'), join('tests', 'contact-address.test.ts')];
const isSelf = (f: string) => SELF.some((s) => f.endsWith(s));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'npm-dist', 'theme-audit', 'coverage'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('the contact address', () => {
  const files = walk(ROOT).filter((f) =>
    ['.ts', '.tsx', '.mjs', '.js', '.json', '.md', '.yml', '.yaml', ''].includes(extname(f))
  );

  it('scans a meaningful number of files', () => {
    // A walk that silently returns nothing passes every assertion below it.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith('LICENSE'))).toBe(true);
    expect(files.some((f) => f.endsWith('privacy/page.tsx'))).toBe(true);
  });

  it('appears nowhere as a hardcoded literal outside src/lib/contact.ts', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (isSelf(f)) continue;
      // Scoped to SHIPPED surfaces. A fixture address inside a test is not a promise to
      // anyone; the rule here is about what a reader is told to write to.
      if (f.includes(`${ROOT}/tests/`)) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of text.match(EMAIL_RE) ?? []) {
        if (ALLOWED.has(m) || RESERVED.test(m)) continue;
        offenders.push(`${f.slice(ROOT.length + 1)} → ${m}`);
      }
    }
    expect(offenders, `hardcoded address(es):\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('never points at a domain we do not own', () => {
    // enforcee.app was never registered. Any address on it is a promise that bounces.
    const dead: string[] = [];
    for (const f of files) {
      if (isSelf(f)) continue;
      const text = readFileSync(f, 'utf8');
      if (/@enforcee\.app/.test(text)) dead.push(f.slice(ROOT.length + 1));
    }
    expect(dead, `unreachable address in: ${dead.join(', ')}`).toEqual([]);
  });

  it('is reachable from the legal documents that promise it', () => {
    // Both of these name the address as a commitment, so both must resolve it from the
    // single token rather than printing one of their own.
    for (const page of ['src/app/privacy/page.tsx', 'src/app/terms/page.tsx']) {
      const text = readFileSync(join(ROOT, page), 'utf8');
      expect(text, `${page} must import the contact token`).toContain("from '@/lib/contact'");
      expect(text).toContain('CONTACT_EMAIL');
    }
    // And the LICENSE, which is plain text and cannot import anything, must carry the
    // current literal — this is the file that drifted.
    expect(readFileSync(join(ROOT, 'LICENSE'), 'utf8')).toContain(CONTACT_EMAIL);
  });
});
