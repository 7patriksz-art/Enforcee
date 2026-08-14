import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrecondition, preflight } from '../src/lib/prevent/preconditions';

/**
 * The suite was green on Linux and 36 tests failed the first time it ran on Windows.
 *
 * "All tests pass" was therefore a claim about one operating system, presented as a claim
 * about the product — which is exactly the shape of thing this project exists to catch. Two
 * separate bugs were hiding behind it, and only one of them was in the tests:
 *
 *  1. `new URL(x, import.meta.url).pathname` yields `/C:/Users/...` on Windows. Node then
 *     resolves it as `C:\C:\Users\...` and every guard subprocess died with MODULE_NOT_FOUND.
 *  2. `which()` looked for a file literally named `node` with the execute bit set. On
 *     Windows it is `node.exe` and there is no execute bit, so preflight told every Windows
 *     user that node, git and npm were not installed. That is the PREVENT layer confidently
 *     reporting an empty environment — worse than not having it.
 *
 * I cannot run Windows from here, so these are mechanical checks that catch the *shape* of
 * both mistakes on any platform. That is the honest substitute for a second machine, and it
 * is not a replacement for one: `npm test` on Windows is still the real control.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

describe('paths are not assumed to be POSIX', () => {
  const files = [...sourceFiles('tests'), ...sourceFiles('src'), ...sourceFiles('guard'), ...sourceFiles('cli')];

  it('finds files to check, so an empty scan cannot pass', () => {
    // A control. Without it, a broken walker would report "no violations" forever.
    expect(files.length).toBeGreaterThan(30);
  });

  it('never takes .pathname off a file URL', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      // Only flag it in code, not in the comment above explaining the bug.
      for (const line of text.split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/import\.meta\.url\s*\)\s*\.pathname/.test(line)) offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      'use fileURLToPath(new URL(...)) — .pathname gives /C:/... on Windows, which Node then resolves as C:\\C:\\...'
    ).toEqual([]);
  });

  it('never hardcodes the POSIX shell', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/execFileSync\(\s*['"]sh['"]|execFileSync\(\s*['"]\/bin\/sh['"]/.test(line)) offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(offenders, 'use execSync, which uses the platform shell — `sh` does not exist on Windows').toEqual([]);
  });

  it('never tests for an absolute path with startsWith("/")', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/\.startsWith\(\s*['"]\/['"]\s*\)/.test(line)) offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(offenders, "use isAbsolute() — a Windows absolute path is C:\\... and does not start with '/'").toEqual([]);
  });
});

describe('the environment probe works on the platform it is running on', () => {
  it('finds the node binary that is executing this test', () => {
    // Whatever this platform calls it. If this fails, preflight is telling users their
    // environment is empty, which is the loudest possible false negative.
    const r = checkPrecondition({ kind: 'binary', target: 'node', why: 'runs everything' });
    expect(r.met, `which() could not find node on ${process.platform}`).toBe(true);
    expect(r.evidence).toMatch(/→ \S+/);
  });

  it('and still says no to something that genuinely is not there', () => {
    expect(checkPrecondition({ kind: 'binary', target: 'enforcee-no-such-binary-xyz', why: 'control' }).met).toBe(false);
  });

  it('counts exactly the missing ones', () => {
    const report = preflight([
      { kind: 'binary', target: 'node', why: 'a' },
      { kind: 'binary', target: 'definitely-not-installed-xyz', why: 'b' },
    ]);
    expect(report.missing).toHaveLength(1);
  });

  it('runs a command through whatever shell this platform has', () => {
    const r = checkPrecondition({ kind: 'command', target: 'node -e "console.log(42)"', why: 'x', expect: '42' });
    expect(r.met, `the platform shell could not run node on ${process.platform}`).toBe(true);
  });
});
