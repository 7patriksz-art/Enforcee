import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * A licence must be issuable for a project other than this one.
 *
 * Until 2026-08-16 the subject was hardcoded to `enforcee-on-enforcee`, so this script could
 * licence exactly one repository: the one it lives in. Patrik asked for a licence for
 * ScreenKraft and there was no way to issue one — the only options were to reuse the Enforcee
 * licence outside its stated purpose, or change this.
 *
 * `sub` is not access control. The token carries no repo scope and any licence works
 * anywhere. It is the ONLY record of what a token was issued for, it is baked into a signed
 * artefact nothing can revoke, and `enforcee status` surfaces it — so a founder licence found
 * on a machine can be traced back to a decision.
 *
 * These run the real script, and assert on the ORDER of its complaints as much as their
 * content: a bad subject must be reported before the key lookup, because otherwise the user
 * fixes the key, re-runs, and only then learns the other argument was wrong.
 */
const ROOT = resolve(__dirname, '..');

// `npm` is `npm.cmd` on Windows and execFileSync does not resolve shims. Caught here by
// tests/portability.test.ts, which is the seventh bug of this class on this project — and
// Windows is the platform Patrik develops on, so it would have gone red on his machine and
// on the CI leg that matters most for him.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args: string[]): string {
  try {
    return execFileSync(NPM, ['run', 'licence:repo', '--silent', '--', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ENFORCEE_LICENCE_PRIVATE_KEY: '' },
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

describe('a licence can be issued for another project', () => {
  it('rejects a subject that is not a name', () => {
    const out = run(['--sub', 'not a valid subject!']);
    expect(out, 'a free-text subject was accepted into a signed token').toMatch(/not a usable subject/);
  });

  it('reports a bad subject BEFORE asking for the key', () => {
    // The cheap check first. Otherwise the typo surfaces one round trip later.
    const out = run(['--sub', 'BAD SUB']);
    expect(out).toMatch(/not a usable subject/);
    expect(out, 'it demanded the key before checking the argument it already had').not.toMatch(
      /No private key found/
    );
  });

  it('accepts a real project name and gets as far as needing the key', () => {
    const out = run(['--sub', 'screenkraft']);
    expect(out, 'a valid subject was rejected').not.toMatch(/not a usable subject/);
    expect(out, 'it should now be blocked only by the missing key').toMatch(/No private key found/);
  });

  it('still defaults to enforcee-on-enforcee when no subject is given', () => {
    // Never silently reverse a decision: existing invocations must behave exactly as before.
    const out = run([]);
    expect(out).not.toMatch(/not a usable subject/);
    expect(out).toMatch(/No private key found/);
  });
});
