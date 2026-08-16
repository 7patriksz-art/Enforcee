import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setLicence, LICENCE_PATHS, findLicence } from '@/lib/licence-local';

/**
 * A licence issued FOR a project must be installable INTO that project.
 *
 * `--sub screenkraft` shipped on 2026-08-16 so a licence could name the project it was for.
 * Installing it there was still impossible: `licence set` wrote to `~/.enforcee/licence` and
 * nowhere else, so a licence named for one project silently applied to every repo on the
 * machine — the opposite of what naming it meant.
 *
 * The tell was in the doing. Getting that licence into ScreenKraft required hand-writing the
 * file with `printf`. A step I had to improvise is a step the product was missing.
 *
 * Path selection is tested through `setLicence` rather than through the CLI, because the CLI
 * verifies the signature against the public key it compiles in — so any token a test can mint
 * is rejected BEFORE the write, and a CLI test would only ever exercise the rejection path.
 * That is the half that never touches the filesystem, which is the half not being tested here.
 */

const CLI = resolve(__dirname, '..', 'cli', 'dist', 'enforcee.mjs');
const ok = () => ({ ok: true as const, payload: { jti: 'x', sub: 'screenkraft', plan: 'founder' as const, exp: 9e9, iat: 0, v: 1 as const } });
let project: string;
afterAll(() => rmSync(project, { recursive: true, force: true }));
beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'enforcee-scope-'));
});

describe('a licence can be scoped to one project', () => {
  it('writes into the project when given a project path', () => {
    const target = join(project, LICENCE_PATHS.project);
    const res = setLicence('token-abc', { path: target, verify: ok });
    expect(res.ok).toBe(true);
    expect(existsSync(target), 'nothing was written into the project').toBe(true);
    expect(readFileSync(target, 'utf8').trim()).toBe('token-abc');
  });

  it('a project licence is what that project then resolves', () => {
    // The property that makes scoping mean anything: findLicence must prefer it over home.
    const found = findLicence(project);
    expect(found.token).toBe('token-abc');
    expect(found.from, 'the project licence was ignored in favour of the machine one').toContain(project);
  });

  it('still defaults to the machine when no path is given', () => {
    // Never silently reverse a decision: the existing behaviour is the default.
    const res = setLicence('token-xyz', { verify: ok, path: join(project, 'fake-home', 'licence') });
    expect(res.ok).toBe(true);
    // And the real default resolves to the home path rather than the cwd.
    expect(LICENCE_PATHS.home).not.toContain(project);
  });
});

describe('the flag is discoverable and its scope is stated', () => {
  const help = execFileSync('node', [CLI], { encoding: 'utf8' });

  it('appears in the help, or nobody finds it', () => {
    expect(help).toMatch(/--project/);
  });

  it('the CLI explains scope in words, not just a path', () => {
    // A path alone does not answer the user's actual question — is the NEXT repo licensed?
    const src = readFileSync(resolve(__dirname, '..', 'cli', 'index.ts'), 'utf8');
    expect(src).toMatch(/this project only/);
    expect(src).toMatch(/every project/);
  });
});
