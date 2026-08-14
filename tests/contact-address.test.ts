import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname, relative, sep } from 'node:path';
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

// Addresses that legitimately are not the contact address.
const ALLOWED = new Set([
  CONTACT_EMAIL,
  'noreply@anthropic.com', // git trailer
  'support@anthropic.com',
  // The SENDING address, on a domain we own. Deliberately not the contact address and
  // deliberately not a mailbox: it exists so branded mail has a From line, and every
  // template sets Reply-To to CONTACT_EMAIL so a human still receives the answer. If this
  // ever becomes the address a reader is told to write to, that is the bug — which is why
  // it is allow-listed by exact string rather than by pattern.
  'noreply@enforcee.com',
]);

/**
 * `example.com`, `example.org` and `example.net` are reserved by RFC 2606 precisely so they
 * can be used as placeholders that provably reach nobody. Form placeholders and test
 * fixtures use them correctly and are not findings — excluding them is what keeps this
 * check's signal at 100%, and a check that cries wolf gets deleted.
 */
const RESERVED = /@example\.(com|org|net|co)\b/i;

/**
 * The three files that legitimately WRITE a dead address down: the token itself, this test,
 * and the invariants ledger. All three quote `hello@enforcee.app` in prose explaining why it
 * was dead — excluding them is the difference between a check that documents history and one
 * that forbids documenting it.
 *
 * The list is deliberately explicit rather than a pattern like "any .md". A new page that
 * mentions an old address by accident must still be caught, and the only way to keep that
 * true is to name every exception one at a time.
 */
const SELF = [
  join('src', 'lib', 'contact.ts'),
  join('tests', 'contact-address.test.ts'),
  'INVARIANTS.md',
];
const isSelf = (f: string) => SELF.some((s) => f.endsWith(s));

/**
 * Repo-relative path segments, on any platform.
 *
 * Every path comparison in this file goes through here. The first version compared with
 * a hardcoded `/` — `f.includes(`${ROOT}/tests/`)` and `f.endsWith('privacy/page.tsx')` —
 * which is always false on Windows, where the separator is a backslash. Both passed
 * locally and both went red on the Windows leg of CI. That is the fourth path-separator
 * bug on this project; the rule is that a literal slash never appears in a comparison.
 */
const segments = (f: string) => relative(ROOT, f).split(sep);
const inDir = (f: string, dir: string) => segments(f)[0] === dir;
const endsWithPath = (f: string, ...parts: string[]) => f.endsWith(join(...parts));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'npm-dist', 'theme-audit', 'coverage'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('path comparison is separator-agnostic', () => {
  /**
   * Proven from Linux by running the same logic against `path.win32`, rather than waiting
   * for the Windows leg of CI to say so. That leg has now caught four separator bugs on
   * this project, each one costing a full red build; this is the cheap version of the
   * same check and it runs everywhere.
   */
  it('classifies a Windows path the same way it classifies a POSIX one', async () => {
    const { win32, posix } = await import('node:path');

    for (const [name, p, root, file] of [
      ['win32', win32, 'D:\\a\\Enforcee\\Enforcee', 'D:\\a\\Enforcee\\Enforcee\\tests\\licence.test.ts'],
      ['posix', posix, '/home/x/Enforcee', '/home/x/Enforcee/tests/licence.test.ts'],
    ] as const) {
      const seg = p.relative(root, file).split(p.sep);
      expect(seg[0], `${name}: first segment`).toBe('tests');
    }

    // …and the shape that was actually shipped broken: a literal '/' comparison is true
    // on POSIX and false on Windows, so it silently stops excluding anything.
    const winFile = 'D:\\a\\Enforcee\\Enforcee\\tests\\licence.test.ts';
    expect(winFile.includes('D:\\a\\Enforcee\\Enforcee/tests/')).toBe(false); // invariant-ok: this line IS the proof that the shape fails on Windows
  });
});

describe('the contact address', () => {
  const files = walk(ROOT).filter((f) =>
    ['.ts', '.tsx', '.mjs', '.js', '.json', '.md', '.yml', '.yaml', ''].includes(extname(f))
  );

  it('scans a meaningful number of files, including the ones that have drifted', () => {
    // A walk that silently returns nothing passes every assertion below it.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => endsWithPath(f, 'LICENSE'))).toBe(true);
    expect(files.some((f) => endsWithPath(f, 'src', 'app', 'privacy', 'page.tsx'))).toBe(true);
    // And the tests/ exclusion below must actually exclude something. On Windows it
    // silently matched nothing, which is the failure mode that turns an exclusion into a
    // false positive — and turned this suite red on one platform out of three.
    expect(files.filter((f) => inDir(f, 'tests')).length).toBeGreaterThan(5);
  });

  it('appears nowhere as a hardcoded literal outside src/lib/contact.ts', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (isSelf(f)) continue;
      // Scoped to SHIPPED surfaces. A fixture address inside a test is not a promise to
      // anyone; the rule here is about what a reader is told to write to.
      if (inDir(f, 'tests')) continue;
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
