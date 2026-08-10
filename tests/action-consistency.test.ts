import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The action's default CLI version and the usage example in the README both name a
 * released version. Getting these out of step is silent and lands on someone else's CI:
 * `uses: 7patriksz-art/Enforcee@vX` resolves against a git tag, and a tag cut before
 * action.yml existed fails with "action.yml not found" in a stranger's pull request.
 *
 * That is exactly what nearly shipped — the action was written pointing at v0.1.3, a tag
 * whose tree has no action.yml. Caught by checking the tag rather than by reading the file.
 */
describe('action version references', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const action = readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  it('action.yml defaults to the current package version', () => {
    expect(action).toContain(`default: '${pkg.version}'`);
  });

  it('the README usage example pins the current version', () => {
    const m = readme.match(/uses: 7patriksz-art\/Enforcee@v([\d.]+)/);
    expect(m, 'README has no action usage example to check').not.toBeNull();
    expect(m![1]).toBe(pkg.version);
  });

  it('the plugin manifest tracks the package version', () => {
    const plugin = JSON.parse(readFileSync(new URL('../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'));
    expect(plugin.version).toBe(pkg.version);
  });
});

/**
 * `enforcee --version` reported 0.1.0 through eight releases, because VERSION was a hardcoded
 * string in cli/index.ts. Every bug report carried the wrong number and there was no way for
 * a user to tell which build they had.
 *
 * Now injected at build time from package.json. This test asserts the build actually does it,
 * because a define that silently stops working would restore the old lie with no visible change.
 */
describe('the CLI reports its real version', () => {
  it('build:cli injects the version rather than hardcoding one', () => {
    const pkgRaw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(pkgRaw).toContain('__ENFORCEE_VERSION__');
  });

  it('cli/index.ts contains no hardcoded version literal', () => {
    const cli = readFileSync(new URL('../cli/index.ts', import.meta.url), 'utf8');
    const hardcoded = cli.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
    expect(hardcoded, `VERSION is hardcoded to ${hardcoded?.[1]}`).toBeNull();
  });
});

/**
 * package-lock.json carries its own copy of the version. Eight releases bumped package.json
 * and left the lockfile at 0.1.0, and `npm ci` — which CI uses and local `npm install` does
 * not — refuses to run when they disagree. That is why v0.3.0 never published.
 *
 * Eighth instance of one value living in two files on this project. The fix is a test, not
 * a reminder.
 */
describe('package-lock stays in step with package.json', () => {
  it('root version matches', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
    expect(lock.version, 'lockfile version is stale — npm ci will refuse to install').toBe(pkg.version);
    expect(lock.packages?.['']?.version).toBe(pkg.version);
  });
});
