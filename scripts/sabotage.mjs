#!/usr/bin/env node
/**
 * Break every control on purpose and require it to go red.
 *
 * Charter honesty rule 6: "A control that could not have failed is not a control." Seven
 * controls on this project have now passed over the exact thing they were written to catch.
 * The most recent kept main red on windows-latest for two commits while
 * tests/portability.test.ts sat green with a rule titled "never execFiles a .cmd or .bat,
 * even by explicit name" — the literal was one line away from the call and the regex was
 * line-scoped.
 *
 * A green suite says nothing about whether a control can fail. This says it, per control,
 * by name.
 *
 * TWO THINGS THIS HARNESS DOES THAT THE OBVIOUS VERSION DOES NOT
 *
 *  1. It ASSERTS THE SABOTAGE APPLIED before running anything. A string replace that matches
 *     nothing reports "control passed" from a sabotage that never happened — a false green
 *     manufactured by the very tool built to find false greens. That has occurred on this
 *     project. Every entry below is checked for its `find` text, with an expected number of
 *     occurrences, and a mismatch is a FAILURE of the harness, not a skip.
 *
 *  2. It reports WHICH TEST went red, not how many. An identical failure count either way
 *     hides a stale test failing for an unrelated reason — so each entry names the assertion
 *     it expects to see, and a red run that goes red somewhere else is reported as a MISS.
 *
 * It never spawns npm: `process.execPath` runs vitest's own entry point directly. npm is a
 * `.cmd` shim on Windows and Node refuses to execFile one at all since the CVE-2024-27980
 * mitigation — the bug this harness exists to keep caught.
 *
 *   node scripts/sabotage.mjs           run every sabotage
 *   node scripts/sabotage.mjs <substr>  run only those whose name matches
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

/**
 * Each entry: remove the fix, and name the control that must notice.
 *
 * `find` must appear exactly `occurrences` times in `file` before the swap. `expect` is
 * matched against the failing output — the assertion text or the test title, so a red for
 * an unrelated reason is not counted as a pass.
 */
const SABOTAGES = [
  {
    name: 'shim-literal-anywhere',
    why: 'the exact 2026-08-17 bug: the shim name one variable away from the spawn',
    file: 'tests/licence-subject.test.ts',
    find: 'execFileSync(process.execPath, [BUNDLE, ...args], {',
    replace:
      "const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';\n" +
      "    return execFileSync(NPM, ['run', 'licence:repo', '--silent', '--', ...args], {",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /never names a .cmd or .bat shim ANYWHERE/,
  },
  {
    name: 'shim-literal-on-the-call-line',
    why: 'the older shape, which the line-scoped rules do catch — proves they still work',
    file: 'tests/licence-subject.test.ts',
    find: 'execFileSync(process.execPath, [BUNDLE, ...args], {',
    replace: "return execFileSync('npm.cmd', ['run', 'licence:repo', '--silent', '--', ...args], {",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /never execFiles a .cmd or .bat|never names a .cmd or .bat shim ANYWHERE/,
  },
  {
    name: 'bare-npm-spawn',
    why: 'execFileSync("npm") threw ENOENT on every Windows runner',
    file: 'tests/licence-subject.test.ts',
    find: 'execFileSync(process.execPath, [BUNDLE, ...args], {',
    replace: "return execFileSync('npm', ['run', 'licence:repo', '--silent', '--', ...args], {",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /never spawns npm or another .cmd shim by bare name/,
  },
  {
    name: 'silent-spawn-failure',
    why: 'a spawn that never started must not look like a script that printed nothing — that is how four false accusations were produced',
    file: 'tests/licence-subject.test.ts',
    find: "if (!err.stdout && !err.stderr) return `SPAWN FAILED: ${err.message ?? String(e)}`;",
    replace: '',
    occurrences: 1,
    run: 'tests/spawn-honesty.test.ts',
    expect: /reports a failed spawn as a failed spawn/,
  },
  {
    name: 'widened-exempt-list',
    why: 'the exempt list is a hole in the shim rule; growing it must not be a one-line edit',
    file: 'tests/portability.test.ts',
    find: "    join('scripts', 'sabotage.mjs'), // the harness that proves this rule can go red\n",
    replace:
      "    join('scripts', 'sabotage.mjs'), // the harness that proves this rule can go red\n" +
      "    join('scripts', 'pack-cli.mjs'), // <- sabotage: a third file, quietly\n",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /the exempt list is a closed set of two/,
  },
  {
    name: 'doc-names-a-missing-npm-script',
    why: 'a doc telling a session to run a script that does not exist — the `npm run doctor` shape',
    file: 'README.md',
    find: 'Enforcee gives you an answer with evidence, and then stops the things it can stop.',
    replace:
      'Enforcee gives you an answer with evidence, and then stops the things it can stop.\n\n' +
      'Run `npm run doctor-that-does-not-exist` first.',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /every .npm run <script>. is a script in package.json/,
  },
  {
    name: 'plan-ticks-off-an-unbuilt-command',
    why: 'the exact 2026-08-17 failure: a plan recording `enforcee onboard` as SHIPPED when it is not on main',
    file: 'PLAN-ENGINE.md',
    find: '### CHANGE 6',
    replace: 'SHIPPED: `enforcee onboard` — done.\n\n### CHANGE 6',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /may not mark one SHIPPED unless it is/,
  },
  {
    name: 'doc-names-a-missing-script-file',
    why: '`node scripts/sabotage.mjs` was cited as a whole release’s verification while the file was not on main',
    file: 'docs/LICENCE-KEY.md',
    find: 'node cli/dist/enforcee.mjs licence set',
    replace: 'node scripts/no-such-script.mjs && node cli/dist/enforcee.mjs licence set',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /every script path a doc tells you to run is a file that exists/,
  },
  {
    name: 'sitemap-omission',
    why: '/what-is-already-free was missing from the sitemap entirely and nothing noticed',
    file: 'src/app/sitemap.ts',
    find: "{ path: '/what-is-already-free', priority: 0.8, changeFrequency: 'monthly' },",
    replace: '',
    occurrences: 1,
    run: 'tests/discoverability.test.ts',
    expect: /lists every public page that is meant to be indexed/,
  },
  {
    name: 'gated-page-indexed',
    why: 'putting a gated page in the sitemap leaks it to search',
    file: 'src/app/sitemap.ts',
    find: "{ path: '/audit', priority: 0.9, changeFrequency: 'weekly' },",
    replace:
      "{ path: '/audit', priority: 0.9, changeFrequency: 'weekly' },\n" +
      "  { path: '/admin', priority: 0.9, changeFrequency: 'weekly' },",
    occurrences: 1,
    run: 'tests/discoverability.test.ts',
    expect: /lists no gated page/,
  },
  {
    name: 'doc-scan-stops-at-the-top-level',
    why:
      'the project-docs half of doc-claims: a walker that does not descend reports a clean ' +
      'result from a directory it only half read — the same shape as the contrast parser that ' +
      'matched zero rules twice while every assertion passed over the empty object',
    file: 'scripts/doc-claims.mjs',
    find: 'if (entry.isDirectory()) markdownFiles(root, rel, out);',
    replace: 'if (entry.isDirectory()) continue;',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /walks a directory that is not the repository/,
  },
  {
    name: 'doc-scan-invents-a-subcommand',
    why:
      'reading the SECOND word after `enforcee` turns `enforcee audit CLAUDE.md` into a claim ' +
      'that a subcommand named CLAUDE exists — a false accusation manufactured by the checker ' +
      'built to stop false claims. An earlier draft of this file did exactly that.',
    file: 'scripts/doc-claims.mjs',
    find: "const ENFORCEE_INSTRUCTION = /(?:`|\\$ |npx )(?:npx )?enforcee ([a-z][a-z-]*)/g;",
    replace: "const ENFORCEE_INSTRUCTION = /(?:`|\\$ |npx )(?:npx )?enforcee (?:[a-z-]+ )?([A-Za-z][A-Za-z.-]*)/g;",
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /does not manufacture a claim out of an argument|was read as a subcommand named CLAUDE/,
  },
];

const filter = process.argv[2];
const chosen = filter ? SABOTAGES.filter((s) => s.name.includes(filter)) : SABOTAGES;

if (chosen.length === 0) {
  console.error(`no sabotage matches "${filter}". Known: ${SABOTAGES.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

// A harness that selected nothing and reported success is the failure it exists to prevent.
if (!filter && chosen.length < SABOTAGES.length) {
  console.error('the sabotage table lost entries between definition and use');
  process.exit(2);
}

let red = 0;
const misses = [];

for (const s of chosen) {
  const path = join(ROOT, s.file);
  const original = readFileSync(path, 'utf8');

  // 1. THE SABOTAGE MUST APPLY. This is the check that stops a no-op replace from being
  //    reported as a control that held.
  const hits = original.split(s.find).length - 1;
  if (hits !== s.occurrences) {
    misses.push(`${s.name}: NOT APPLIED — found ${hits} occurrence(s) of the anchor, expected ${s.occurrences}`);
    console.log(`✗ ${s.name.padEnd(32)} SABOTAGE DID NOT APPLY (anchor found ${hits}×, expected ${s.occurrences})`);
    continue;
  }
  const broken = original.replace(s.find, s.replace);
  if (broken === original) {
    misses.push(`${s.name}: replacement changed nothing`);
    console.log(`✗ ${s.name.padEnd(32)} SABOTAGE CHANGED NOTHING`);
    continue;
  }

  writeFileSync(path, broken);
  let output = '';
  let exit = 0;
  try {
    output = execFileSync(process.execPath, [VITEST, 'run', s.run, '--reporter=basic'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    exit = e.status ?? 1;
    output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (!output) output = `SPAWN FAILED: ${e.message}`;
  } finally {
    writeFileSync(path, original);
  }

  // 2. RED IS NOT ENOUGH. It has to be red in the named place.
  if (exit === 0) {
    misses.push(`${s.name}: control stayed GREEN with the fix removed — it cannot fail`);
    console.log(`✗ ${s.name.padEnd(32)} STAYED GREEN — not a control`);
  } else if (!s.expect.test(output)) {
    misses.push(`${s.name}: went red, but not at ${s.expect} — possibly a stale or unrelated failure`);
    console.log(`✗ ${s.name.padEnd(32)} red in the WRONG place`);
  } else {
    red++;
    const which = (output.match(/[×✕✗]\s+(.+)/) || [, s.expect.source])[1].trim().slice(0, 88);
    console.log(`✓ ${s.name.padEnd(32)} red: ${which}`);
  }
}

console.log(`\n${red}/${chosen.length} controls proved they can fail. ${SABOTAGES.length} sabotages defined.`);
if (misses.length) {
  console.log('\nNOT PROVEN:');
  for (const m of misses) console.log(`  · ${m}`);
  process.exit(1);
}
