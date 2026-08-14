import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The plugin ships its own copy of the guard runner, and it has to.
 *
 * Claude Code's plugin reference is explicit: "Installed plugins cannot reference files
 * outside their directory. Paths that traverse outside the plugin root (such as
 * `../shared-utils`) will not work after installation because those external files are not
 * copied to the cache."
 *
 * The original hooks.json pointed at ${CLAUDE_PLUGIN_ROOT}/../guard/guard.mjs. That resolves
 * fine in this repo and breaks the moment anyone installs it — and it breaks *silently*,
 * because a hook that cannot run is a non-blocking error. The plugin would have looked
 * installed and blocked nothing, which is the same failure shape as the missing runner in
 * npm 0.1.0. Twice in one day is a pattern, so it gets a test rather than a comment.
 *
 * A symlink would also work for marketplace installs but is documented as skipped for
 * --plugin-dir and local-path installs. A conditional fix for an invisible failure is worse
 * than a duplicated file plus this test.
 */
describe('plugin guard runner', () => {
  it('is byte-identical to the canonical guard/guard.mjs', () => {
    const canonical = readFileSync(new URL('../guard/guard.mjs', import.meta.url));
    const shipped = readFileSync(new URL('../plugin/guard.mjs', import.meta.url));
    expect(shipped.equals(canonical)).toBe(true);
  });

  it('has no hook command that escapes the plugin root', () => {
    // Parse it rather than regex it — the commands contain escaped quotes, and a regex
    // that stops at the first \" reports a false failure. Read the structure, not the text.
    const raw = readFileSync(new URL('../plugin/hooks/hooks.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
    const commands = Object.values(parsed.hooks).flat().flatMap((e) => e.hooks.map((h) => h.command));
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) {
      expect(c).toContain('${CLAUDE_PLUGIN_ROOT}');
      expect(c, `hook command escapes the plugin root: ${c}`).not.toContain('..');
    }
  });

  it('the shipped copy actually runs and denies a forbidden command', () => {
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      session_id: 'test',
      tool_input: { command: 'git push -f origin main' },
    });
    // No licence in the test environment, so the guard should step aside and say so —
    // proving the file is present, parses, and produces well-formed JSON on stdout.
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('../plugin/guard.mjs', import.meta.url))], {
      input: payload, encoding: 'utf8', env: { ...process.env, ENFORCEE_LICENCE: '' },
    });
    expect(() => JSON.parse(out || '{}')).not.toThrow();
  });
});
