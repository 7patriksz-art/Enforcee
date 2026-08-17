import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSync } from 'esbuild';

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

/**
 * This used to spawn `npm run licence:repo`, naming the binary
 * `process.platform === 'win32' ? 'npm.cmd' : 'npm'`. That kept main RED on windows-latest
 * for two commits (CI runs 70 and 71): since the CVE-2024-27980 mitigation Node refuses to
 * execFile a `.cmd` at all without `shell: true`, so the spawn threw BEFORE the process
 * existed — no stdout, no stderr — and the catch below turned that into `''`. All four
 * assertions then failed by accusing the licence script of printing the wrong thing when the
 * script had never run. Our own harness manufacturing a false accusation, which is the one
 * thing this product exists not to do.
 *
 * The dependency is removed rather than worked around (rung 7 of the escalation ladder in
 * docs/THE-CYCLE.md): esbuild is imported as a library and the bundle is spawned with
 * `process.execPath`. Same entry point and same flags as the npm script, so this still
 * exercises the shipped artefact — but there is no shim to resolve on any platform.
 */
const ENTRY = 'scripts/issue-repo-licence.mjs';
const BUNDLE = resolve(ROOT, 'scripts/dist/issue-repo-licence.mjs');

beforeAll(() => {
  buildSync({
    entryPoints: [resolve(ROOT, ENTRY)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: BUNDLE,
    logLevel: 'warning',
  });
}, 60_000);

function run(args: string[]): string {
  try {
    return execFileSync(process.execPath, [BUNDLE, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ENFORCEE_LICENCE_PRIVATE_KEY: '' },
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    // A spawn that never started must not look like a script that printed nothing. Silence
    // here is what produced four false accusations; it now says so out loud.
    if (!err.stdout && !err.stderr) return `SPAWN FAILED: ${err.message ?? String(e)}`;
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
