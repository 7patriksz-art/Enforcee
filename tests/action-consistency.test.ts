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
