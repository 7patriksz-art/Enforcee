import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractClaims, checkClaims } from '../src/lib/prevent/claims';
import type { ParsedSession } from '../src/lib/transcript/parse';

/**
 * "Ask one to add authentication to your project and it'll tell you it's done. Commits made,
 * tests passing, middleware wired up. Check the branch and you'll find a half-written JWT
 * helper, no tests, and a build that doesn't compile."
 *   — recorded at severity critical in our own market recon
 *
 * Measured at 22.58% of misalignment episodes across 20,574 real sessions (arXiv 2605.29442).
 *
 * The precision bar here is deliberately brutal. A false REFUTED — telling someone their
 * agent lied when it did not — destroys the feature's credibility in one sighting. Every
 * "does not fire" test below is as important as the ones that do.
 */

const session = (commands: string[]): ParsedSession =>
  ({
    toolCalls: commands.map((command, index) => ({
      index, uuid: `u${index}`, name: 'Bash', input: { command },
      timestamp: null, isSidechain: false, agentId: null,
    })),
  } as unknown as ParsedSession);

describe('claims about files', () => {
  it('REFUTES a file the model said it created that is not there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claims-'));
    const r = checkClaims('I have created `src/auth.ts` with the middleware wired up.', { cwd: dir });
    expect(r.refuted).toBe(1);
    expect(r.checked[0].reason).toMatch(/does not exist/);
    expect(r.checked[0].evidence).toMatch(/ENOENT/);
  });

  it('CONFIRMS one that is', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claims-'));
    writeFileSync(join(dir, 'auth.ts'), 'export const x = 1;');
    const r = checkClaims('I created `auth.ts` for you.', { cwd: dir });
    expect(r.confirmed).toBe(1);
  });

  it('does NOT treat an intention as a claim', () => {
    // "I'll create" and "I'm going to write" are plans. Refuting a plan would be a false
    // accusation, and one of those is enough for somebody to stop trusting the tool.
    const dir = mkdtempSync(join(tmpdir(), 'claims-'));
    for (const t of [
      "I'll create `src/auth.ts` next.",
      'Next I am going to write `src/auth.ts`.',
      'We could add `src/auth.ts` if you want.',
      'Should I create `src/auth.ts`?',
    ]) {
      expect(extractClaims(t), `treated as a claim: ${t}`).toHaveLength(0);
    }
  });
});

describe('claims about tests', () => {
  it('REFUTES "all tests pass" when no test command was ever run', () => {
    const r = checkClaims('All tests pass and the build is green.', {
      cwd: '/tmp',
      session: session(['git status', 'ls -la', 'cat package.json']),
    });
    expect(r.refuted).toBe(1);
    expect(r.checked[0].reason).toMatch(/No test command was run/);
  });

  it('CONFIRMS it when one was', () => {
    const r = checkClaims('All tests pass.', { cwd: '/tmp', session: session(['npm test']) });
    expect(r.confirmed).toBe(1);
    expect(r.checked[0].evidence).toMatch(/npm test/);
  });

  it('recognises test runners other than npm', () => {
    for (const cmd of ['npx vitest run', 'pytest -q', 'go test ./...', 'cargo test']) {
      const r = checkClaims('Tests are passing.', { cwd: '/tmp', session: session([cmd]) });
      expect(r.confirmed, `not recognised: ${cmd}`).toBe(1);
    }
  });

  it('says UNCHECKABLE rather than guessing when there is no transcript', () => {
    const r = checkClaims('All tests pass.', { cwd: '/tmp' });
    expect(r.uncheckable).toBe(1);
    expect(r.refuted).toBe(0);
  });
});

describe('claims about commits', () => {
  it('REFUTES "committed the changes" with no git commit in the session', () => {
    const r = checkClaims('I committed the changes.', { cwd: '/tmp', session: session(['git status', 'git diff']) });
    expect(r.refuted).toBe(1);
  });

  it('CONFIRMS when git commit appears', () => {
    const r = checkClaims('I committed the changes.', { cwd: '/tmp', session: session(['git commit -m "x"']) });
    expect(r.confirmed).toBe(1);
  });
});

describe('the summary never flatters', () => {
  it('an empty result is not reported as a clean bill of health', () => {
    const r = checkClaims('Everything looks good to me.', { cwd: '/tmp' });
    expect(r.checked).toHaveLength(0);
    // The dangerous reading is "no claims found → nothing wrong". Say what was actually done.
    expect(r.summary).toMatch(/not the same as no false claims/);
  });

  it('leads with the refutation when there is one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claims-'));
    const r = checkClaims('I created `gone.ts` and all tests pass.', { cwd: dir, session: session(['ls']) });
    expect(r.refuted).toBe(2);
    expect(r.summary).toMatch(/contradicted by what actually happened/);
  });
});

/**
 * The evidence quote is what makes a finding arguable. A mangled one is unusable even when
 * the verdict is correct.
 *
 * The first splitter cut on any '.', so "I created `src/auth.ts`" was quoted back as
 * "I created `src/auth." — right answer, useless evidence.
 */
describe('the evidence quote survives a filename', () => {
  it('quotes the whole sentence, not up to the dot in a file extension', () => {
    const claims = extractClaims('I created `src/auth.ts` with the JWT middleware. Nothing else changed.');
    expect(claims).toHaveLength(1);
    expect(claims[0].quote).toBe('I created `src/auth.ts` with the JWT middleware.');
  });

  it('flattens line breaks so the quote reads as one sentence', () => {
    const claims = extractClaims('All tests pass and I\ncommitted the changes.');
    expect(claims[0].quote).toBe('All tests pass and I committed the changes.');
  });

  it('handles a claim in the final sentence with no trailing full stop', () => {
    const claims = extractClaims('Done. I created `x.ts`');
    expect(claims[0].quote).toBe('I created `x.ts`');
  });
});

/**
 * Findings from an adversarial review, 11 August. Every one produced a REFUTED verdict
 * against a user who had done nothing wrong — the single worst output this tool can make.
 */
describe('no control, no verdict', () => {
  it('an empty transcript is UNCHECKABLE, not REFUTED', () => {
    // The exact irony the reviewer named: control.ts exists one directory away and was not
    // used here, so a transcript that parsed to zero tool calls — empty file, truncated
    // mid-line, or the wrong file passed entirely — was indistinguishable from a session
    // where the command genuinely never ran.
    const r = checkClaims('All tests pass and I committed the changes.', {
      cwd: '/tmp', session: session([]),
    });
    expect(r.refuted).toBe(0);
    expect(r.uncheckable).toBe(2);
    expect(r.checked[0].reason).toMatch(/no tool calls/);
  });
});

describe('prose that is not an assertion is never a claim', () => {
  const s = session(['ls']);
  const cases = [
    'I have not committed the changes yet — let me know if you want me to.',
    'If the tests pass, we can ship this today.',
    'Not all tests pass yet — 3 failures in the auth module remain.',
    'Please run the suite and confirm all tests pass before merging.',
    "I'll commit the changes once you confirm.",
  ];
  for (const text of cases) {
    it(`does not accuse: ${text.slice(0, 44)}…`, () => {
      // Accusing somebody of lying because they told you the truth about a failure is worse
      // than missing the claim entirely.
      expect(checkClaims(text, { cwd: '/tmp', session: s }).refuted).toBe(0);
    });
  }

  it('still catches the real assertion', () => {
    expect(checkClaims('All tests pass.', { cwd: '/tmp', session: s }).refuted).toBe(1);
  });
});

describe('test runners beyond the npm allowlist', () => {
  for (const cmd of ['make test', 'npm t', 'mvn -q test', 'dotnet test', './scripts/run-tests.sh', 'gradle test', 'bundle exec rspec']) {
    it(`recognises ${cmd}`, () => {
      expect(checkClaims('All tests pass.', { cwd: '/tmp', session: session([cmd]) }).confirmed).toBe(1);
    });
  }
});
