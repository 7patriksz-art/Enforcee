import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A spawn that never started must never look like a program that printed nothing.
 *
 * 2026-08-17, main red on windows-latest for two commits. tests/licence-subject.test.ts
 * spawned `npm.cmd`, Node refused to execFile it at all (CVE-2024-27980 mitigation), and the
 * throw happened BEFORE the child existed — so `err.stdout` and `err.stderr` were both
 * undefined. This catch:
 *
 *     return `${err.stdout ?? ''}${err.stderr ?? ''}`;
 *
 * turned "the process could not be created" into `''`. Four assertions then failed with
 * `expected '' to match /No private key found/` — our own harness accusing the licence script
 * of printing the wrong thing when the script had never run.
 *
 * That is the product's worst failure mode, produced by the product's own tests: a false
 * accusation, sourced from a control that could not tell absence from silence. The charter
 * names it twice — "never accuse the user of an error the tool caused", and "absence of a
 * violation is weaker evidence than presence of one; say which you have."
 *
 * So the class is closed rather than the instance: anywhere in this repo that harvests a
 * failed child's output must handle the case where there is no child.
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

const files = [...sourceFiles('tests'), ...sourceFiles('scripts'), ...sourceFiles('src'), ...sourceFiles('cli')];

describe('the behaviour this is about, demonstrated rather than asserted', () => {
  it('a spawn that cannot start yields an error with NO stdout and NO stderr', () => {
    // The premise of the whole file. If Node ever started attaching output to a spawn that
    // never happened, the harvesting pattern below would be harmless and this rule could go.
    // It does not, so the rule stays — and this test is what would tell us if that changed.
    let err: { stdout?: unknown; stderr?: unknown; message?: string } = {};
    try {
      execFileSync('enforcee-no-such-binary-xyz', ['--version'], { encoding: 'utf8', stdio: 'pipe' });
      throw new Error('a binary that does not exist was somehow spawned');
    } catch (e) {
      err = e as typeof err;
    }
    expect(err.stdout ?? '', 'a failed spawn produced stdout — the premise of this file changed').toBe('');
    expect(err.stderr ?? '', 'a failed spawn produced stderr — the premise of this file changed').toBe('');
    expect(String(err.message ?? ''), 'the only signal is the message, so it must exist').not.toBe('');
  });

  it('reports a failed spawn as a failed spawn, not as empty output', () => {
    // The named instance, at the file where it actually shipped. Kept as its own assertion
    // so the sabotage harness can point at one line and watch this go red.
    const text = readFileSync(join(ROOT, 'tests', 'licence-subject.test.ts'), 'utf8');
    expect(
      /SPAWN FAILED/.test(text),
      'licence-subject.test.ts harvests a failed child without distinguishing "no output" from "no child"'
    ).toBe(true);
  });
});

describe('nowhere else harvests a failed child without checking one exists', () => {
  const HARVEST = /err\.stdout|e\.stdout|\.stdout\s*\?\?|\.stdout\s*\|\|/;

  it('found files to check, so an empty scan cannot pass', () => {
    // Coverage control. Rule 9: a checker needs a control before the thing it checks does.
    // Two scans on this project silently matched zero rules and every assertion passed over
    // the empty result.
    expect(files.length, 'the walk returned nothing and would report every file clean').toBeGreaterThan(30);
    expect(files, 'the file the rule was written for is not in the scan').toContain(
      join('tests', 'licence-subject.test.ts')
    );
  });

  it('every catch that harvests stdout also names the no-child case', () => {
    const offenders: string[] = [];
    let harvestSites = 0;
    for (const f of files) {
      const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
      for (const [i, line] of lines.entries()) {
        if (/^\s*(\/\/|\*|#)/.test(line)) continue;
        if (!HARVEST.test(line)) continue;
        // Only a harvest from a CAUGHT error can be a spawn that never started. Reading
        // `.stdout` off a successful result is a different thing entirely, and flagging it
        // would make this rule fire on correct code — the lint-teaching-the-wrong-lesson
        // shape already recorded one rule above.
        if (!/catch\s*\(/.test(lines.slice(Math.max(0, i - 8), i + 1).join('\n'))) continue;
        harvestSites++;
        // The remedy has to be near the harvest to be the same code path. Six lines either
        // side is the whole of every such catch block in this repo today.
        const near = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
        if (!/SPAWN FAILED|\.message|status === null|signal/.test(near)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    // A rule that matched nothing is not a rule. If every harvest site disappears this
    // fails loudly rather than passing forever over an empty set.
    expect(harvestSites, 'no spawn-output harvesting found anywhere — the rule now checks nothing').toBeGreaterThan(0);
    expect(
      offenders,
      'a failed spawn will read as an empty result here. Distinguish it: if there is no stdout ' +
        'and no stderr, the child never ran, and saying so is the difference between a finding and a false accusation.'
    ).toEqual([]);
  });
});
