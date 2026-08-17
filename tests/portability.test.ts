import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrecondition, preflight } from '../src/lib/prevent/preconditions';
import { isInside } from '../src/lib/prevent/claims';
import { win32, posix } from 'node:path';

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
  // `scripts` is here because it was NOT, and scripts/pack-cli.mjs is the file that broke
  // the release on Windows. A scanner that does not look at a directory reports it clean
  // forever — the same silent-skip shape this codebase keeps finding in itself.
  const files = [
    ...sourceFiles('tests'),
    ...sourceFiles('src'),
    ...sourceFiles('guard'),
    ...sourceFiles('cli'),
    ...sourceFiles('scripts'),
  ];

  // One list, used by the shim rule below and by the test that audits the list itself.
  // Duplicating it is the twelfth-time-repeated defect on this project.
  const EXEMPT_FILES = [
    join('tests', 'portability.test.ts'), // this file: the rule has to quote what it bans
    join('scripts', 'sabotage.mjs'), // the harness that proves this rule can go red
  ];

  it('looks at every directory that ships code, including scripts', () => {
    for (const d of ['tests/', 'src/', 'guard/', 'cli/', 'scripts/']) {
      expect(files.some((f) => f.split(/[\\/]/)[0] + '/' === d), `nothing scanned under ${d}`).toBe(true);
    }
  });

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

  it('a directory walker whose results are filtered on "/" normalises them', () => {
    // The fourth instance, and the one the three checks above missed: a walker returning
    // join()ed paths, then filtered with `.includes('/app/admin/')`. On Windows the
    // separator is a backslash, so the filter matched nothing and the test failed by
    // accusing the exact directory it exists to permit.
    //
    // Deliberately narrow — it fires only when a file does BOTH things, which is the bug
    // and is otherwise a rare combination. A general "no / in a string" lint would flag
    // routes and URLs and get switched off within a week.
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      const code = text
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*)/.test(l))
        .join('\n');
      const walks = /readdirSync\(/.test(code);
      // A path FRAGMENT ('/app/admin/'), not a bare separator test ('/'). Testing for a
      // bare '/' is the correct Windows-aware idiom — flagging it made this check fire on
      // the very fix that made a module portable, which is a lint teaching the wrong lesson.
      const filtersOnSlash = /\.(includes|startsWith|endsWith)\(\s*['"`]\/[\w.-]/.test(code);
      const normalises = /split\(\s*sep\s*\)\.join\(\s*['"`]\/['"`]\s*\)|replace\(\s*\/\\\\\\\\\/g/.test(code);
      if (walks && filtersOnSlash && !normalises) offenders.push(f);
    }
    expect(
      offenders,
      "walk the tree, then compare with '/', and it only works on POSIX — normalise with split(sep).join('/')"
    ).toEqual([]);
  });

  it('never spawns npm or another .cmd shim by bare name', () => {
    // spawnSync resolves `.exe` on Windows but NOT `.cmd`, and npm/npx/yarn/pnpm are all
    // .cmd shims there. `execFileSync('npm', ...)` therefore threw ENOENT on every Windows
    // runner and failed the pre-publish check before it ran a single one of its eight tests.
    // `node` is fine — node.exe is a real executable — but process.execPath is better still,
    // because it is the interpreter actually running the check.
    const offenders: string[] = [];
    for (const f of files) {
      if (EXEMPT_FILES.includes(f)) continue; // the rule and its sabotage harness must quote what they ban
      for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/execFileSync\(\s*['"](npm|npx|yarn|pnpm|tsc|vitest|eslint|prettier)['"]/.test(line)) {
          offenders.push(`${f}: ${line.trim()}`);
        }
      }
    }
    // The remedy this used to print was `process.platform === 'win32' ? 'npm.cmd' : 'npm'`
    // — the exact pattern the very next test bans, and the one that kept main red on
    // windows-latest. A control that prints a remedy another control forbids is worse than
    // one that prints none: it is a wrong answer with our name on it. Charter, CONTINUE:
    // "every remediation Enforcee prints should be one we have actually run."
    expect(
      offenders,
      'spawn process.execPath, or import the tool as a library — never a shim name. ' +
        'Node will not execFile a .cmd at all (CVE-2024-27980 mitigation), so `npm.cmd` is worse, not better.'
    ).toEqual([]);
  });

  it('never execFiles a .cmd or .bat, even by explicit name', () => {
    // The trap that kept CI red for five releases. `execFileSync('npm', ...)` fails on
    // Windows because spawnSync resolves .exe but not .cmd — so 0.8.4 changed it to
    // 'npm.cmd', which is WORSE: since the CVE-2024-27980 mitigation, Node refuses to spawn
    // a .bat or .cmd through execFile at all without `shell: true`. execSync uses the
    // platform shell and works on both.
    const offenders: string[] = [];
    for (const f of files) {
      if (EXEMPT_FILES.includes(f)) continue; // ditto — same closed set, audited above
      for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        if (/execFileSync?\([^)]*\.(cmd|bat)['"`]/.test(line)) offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      'spawn process.execPath, or import the tool as a library. Not execSync either: a shell ' +
        'quoting bug is how CVE-2024-27980 happened in the first place.'
    ).toEqual([]);
  });

  it('never names a .cmd or .bat shim ANYWHERE, however far from the spawn', () => {
    // The seventh control on this project that passed over the exact thing it was written
    // to catch. Both checks above are LINE-scoped: they need the shim literal and the
    // execFile call on the same line. tests/licence-subject.test.ts put the literal on line
    // 28 and the call on line 31:
    //
    //     const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';   // line 28
    //     execFileSync(NPM, [...])                                       // line 31
    //
    // Neither regex matched, both stayed green, and main was red on windows-latest for two
    // commits. One variable of indirection defeated the whole control.
    //
    // This rule survives the indirection because it stops looking at the call site. A shim
    // name has no legitimate use in this codebase wherever it appears — every place that
    // needs to run node has process.execPath, and every place that needs a build step can
    // import esbuild. So the literal itself is the offence, and there is nowhere to hide it.
    const EXEMPT = new Set(EXEMPT_FILES);
    const offenders: string[] = [];
    for (const f of files) {
      if (EXEMPT.has(f)) continue;
      for (const [i, line] of readFileSync(join(ROOT, f), 'utf8').split('\n').entries()) {
        if (/^\s*(\/\/|\*|#)/.test(line)) continue;
        if (/['"`][\w.-]*\.(cmd|bat)['"`]/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      'spawn process.execPath, or import the tool as a library — never name a .cmd/.bat shim'
    ).toEqual([]);
  });

  it('and the exempt list is a closed set of two, so it cannot be widened quietly', () => {
    // An exempt list is a hole in a control, and the way holes get abused is by growing.
    // Only two files can legitimately contain the banned literal: the rule that has to
    // quote what it bans, and the harness that proves the rule goes red. Adding a third
    // fails HERE, which forces the exemption to be an argued decision rather than a
    // one-line edit that silently turns the check off for a whole file.
    expect(EXEMPT_FILES.slice().sort(), 'the shim exemption is not a place to park a new file').toEqual(
      [join('scripts', 'sabotage.mjs'), join('tests', 'portability.test.ts')].sort()
    );
    // And an entry that names a file which does not exist is an exemption for nothing,
    // while the real file goes on being checked under a different path — a stale hole that
    // reads as coverage. Both must be files this scan actually walked.
    for (const f of EXEMPT_FILES) {
      expect(files, `${f} is exempt from a scan that never reaches it`).toContain(f);
    }
    // What this does NOT do, stated rather than implied: it does not prove the two exempt
    // files are safe. Inside them the literal is unpoliced. They are exempt because the
    // rule cannot express itself without quoting the thing it forbids, and that cost is
    // paid deliberately, in two named places, not spread across the tree.
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

describe('path containment does not fail open across drives', () => {
  // The obvious spelling of this check — !relative(base, full).startsWith('..') — is wrong
  // on Windows and right everywhere else, which is why it survived nine releases and was
  // found by CI rather than by reading. Across drives there is no relative route, so
  // relative() returns an ABSOLUTE path, which does not begin with '..'.
  //
  // Proven here for BOTH platforms' semantics from whichever one is running, because a rule
  // about Windows that can only be checked on Windows gets checked once a release.

  it('rejects a different drive on Windows semantics', () => {
    const base = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\claims-abc';
    expect(isInside(base, 'D:\\etc\\hosts', win32), 'a different drive is not inside the project').toBe(false);
    expect(isInside(base, 'C:\\etc\\hosts', win32)).toBe(false);
  });

  it('still accepts a real child on Windows semantics', () => {
    const base = 'C:\\proj';
    expect(isInside(base, 'C:\\proj\\src\\a.ts', win32)).toBe(true);
    expect(isInside(base, 'C:\\proj', win32)).toBe(true);
  });

  it('rejects an escape on POSIX semantics', () => {
    expect(isInside('/tmp/claims-abc', '/etc/hosts', posix)).toBe(false);
    expect(isInside('/tmp/claims-abc', '/tmp/claims-abc/../x', posix)).toBe(false);
  });

  it('still accepts a real child on POSIX semantics', () => {
    expect(isInside('/proj', '/proj/src/a.ts', posix)).toBe(true);
    expect(isInside('/proj', '/proj', posix)).toBe(true);
  });

  it('is not fooled by a sibling with the same prefix', () => {
    expect(isInside('/proj', '/project/secrets', posix)).toBe(false);
    expect(isInside('C:\\proj', 'C:\\project\\secrets', win32)).toBe(false);
  });
});
