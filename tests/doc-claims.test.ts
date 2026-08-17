import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { markdownFiles, repoMechanisms, rules, scan } from '../scripts/doc-claims.mjs';

/**
 * A document that names a mechanism must be naming one that exists.
 *
 * This is CHANGE 4 of the engine plan, in the smallest form that does any work: "a doc
 * asserting a mechanism should be checkable against the repo… both are one grep away from
 * being automatic." Three instances are already recorded, all of them written by a session
 * describing its own work:
 *
 *   · `npm run doctor` — "thirteen checks… failing if fewer than eleven checks ran".
 *     Verified absent 2026-08-16. Never existed.
 *   · `node scripts/sabotage.mjs` — cited on 2026-08-17 as the verification for a whole
 *     release ("nine sabotages, nine red"). The file was not on main. It is now, but it was
 *     rebuilt from the prose, not recovered — the prose outlived the code by a day.
 *   · `enforcee onboard` — recorded as shipped in the project index, the doc every session
 *     reads first. Not on main.
 *
 * Each of those is a future session confidently running a command that does not exist, then
 * spending its budget deciding whether the failure is the environment. Sixteen
 * contradictions accumulated across nine days with a green suite the whole time, because
 * prose in a repository is not a control. This makes one narrow slice of it a control.
 *
 * WHAT THIS FILE ALONE CANNOT DO, stated rather than implied: a test reads the markdown IN
 * THIS REPOSITORY. All three instances above were written into the claude.ai project docs,
 * which are not here. As of 2026-08-17 those docs assert SIX mechanisms that have never
 * existed in this repository's history — `git log --all` returns zero commits for each of
 * `tests/doc-claims.test.ts`, `scripts/sabotage.mjs`, `tests/spawn-honesty.test.ts`,
 * `tests/helpers/spawn.ts`, `src/lib/onboard.ts` and `tests/licence-route-expiry.test.ts`.
 *
 * So the rules moved into `scripts/doc-claims.mjs`, which this file imports and which a
 * scheduled run points at the dumped project docs:
 *
 *     npm run doc-claims -- <dir of dumped project docs> --min 100
 *
 * One copy of the rules, two places they run. The last section below is the control on the
 * checker itself — rule 9, "a checker needs a control before the thing it checks does".
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const docs = new Map(
  markdownFiles(ROOT)
    // `.enforcee/` is generated output, not authored prose — it records what a run produced
    // and is rewritten on every dogfood. Everything a human or a model would read is in scope.
    .filter((f) => !f.startsWith('.enforcee'))
    .map((f) => [f, readFileSync(join(ROOT, f), 'utf8')] as [string, string])
);
const mech = repoMechanisms(ROOT);
const results = rules(docs, mech);

describe('the scan covers something, so an empty one cannot pass', () => {
  // Rule 9: a checker needs a control before the thing it checks does. Two scans on this
  // project silently matched zero rules and every assertion passed over the empty result.
  it('found the docs a session actually reads', () => {
    expect(docs.size, 'the markdown walk returned nothing').toBeGreaterThan(10);
    for (const required of ['README.md', 'CLAUDE.md', 'docs/THE-CYCLE.md']) {
      expect([...docs.keys()], `${required} is not in the scan`).toContain(required);
    }
  });

  it('read the CLI dispatch table rather than a hardcoded list', () => {
    expect(mech.commands.size, 'no commands parsed out of cli/index.ts — the shape changed').toBeGreaterThan(8);
    for (const c of ['audit', 'guard', 'obstacles']) {
      expect(mech.commands.has(c), `${c} is missing from the parsed dispatch table`).toBe(true);
    }
  });
});

describe('every mechanism named in a repo doc exists', () => {
  it('every `npm run <script>` is a script in package.json', () => {
    expect(
      results['npm-script'].examined,
      'no `npm run` reference found in any doc — this rule now checks nothing'
    ).toBeGreaterThan(5);
    expect(
      results['npm-script'].missing,
      'a doc tells the reader to run a script that does not exist. Add the script, or correct the doc — ' +
        'a session that trusts it spends its budget deciding whether the failure is the environment.'
    ).toEqual([]);
  });

  it('every `enforcee <command>` a doc tells you to run is one the CLI dispatches', () => {
    expect(
      results['cli-command'].examined,
      'no `enforcee <cmd>` instruction found in any doc — this rule now checks nothing'
    ).toBeGreaterThan(5);
    expect(
      results['cli-command'].missing,
      'a doc tells the reader to run a CLI command that cli/index.ts does not dispatch.'
    ).toEqual([]);
  });

  it('a plan may describe an unbuilt command, but may not mark one SHIPPED unless it is', () => {
    // The distinction that makes this rule usable. PLAN-ENGINE.md describes `enforcee
    // onboard` three times and that is correct: it is a plan, the command is planned. What
    // is NOT allowed is a plan claiming the plan happened — which is precisely the recorded
    // failure. `enforcee onboard` was written up as SHIPPED, at version 0.10.0, in the doc
    // every session reads first, and it is not on main; the container holding it was
    // reclaimed before the work was pushed. A tick box is a claim about the repository, so
    // it gets checked against the repository.
    expect(
      markdownFiles(ROOT).filter((f) => /^PLAN-[A-Z-]+\.md$/.test(f)).length,
      'no plan docs found — the rule below checks nothing'
    ).toBeGreaterThan(0);
    expect(
      results['plan-tick-off'].examined,
      'no shipped-claim naming a mechanism found in any plan — verify the pattern still matches'
    ).toBeGreaterThan(0);
    expect(results['plan-tick-off'].missing, 'a plan ticks off a mechanism that is not in this repository').toEqual([]);
  });

  it('every script path a doc tells you to run is a file that exists', () => {
    // Named rather than numeric: a threshold picked to pass today drifts into meaninglessness,
    // whereas a doc we know contains such a path either still does or the walk broke.
    expect(
      results['script-path'].examined,
      'no runnable script path found in any doc — this rule now checks nothing'
    ).toBeGreaterThan(0);
    expect(
      [...docs.values()].some((b) => /node cli\/dist\/enforcee\.mjs/.test(b)),
      'the known script-path reference in docs/LICENCE-KEY.md is gone — the walk or the docs changed'
    ).toBe(true);
    expect(
      results['script-path'].missing,
      'a doc names a script to run and the file is not there. `node scripts/sabotage.mjs` was cited as ' +
        'the verification for an entire release while the file existed only in a container that was reclaimed.'
    ).toEqual([]);
  });
});

describe('the same rules catch the real instances when pointed outside the repo', () => {
  /**
   * The control on the checker. Every instance of this class happened in docs that are not
   * in this tree, so the rules being right *here* proves nothing about the run that matters.
   * These fixtures are the four real failures, transcribed, plus the two shapes that must
   * NOT be flagged — because a checker that manufactures false accusations is this project's
   * worst failure mode, with ten shipped classes behind it.
   */
  const dir = mkdtempSync(join(tmpdir(), 'enforcee-doc-claims-'));
  mkdirSync(join(dir, 'nested'), { recursive: true });
  writeFileSync(
    join(dir, '01-INDEX.md'),
    [
      // Real, from claude/87-HANDOFF-POSTMORTEM-2026-08-16.md — thirteen checks, no script.
      'The handoff runs `npm run doctor`: thirteen checks, failing if fewer than eleven ran.',
      'Run `npm run ci:status` to read CI.', // real, from claude/93-DAILY-2026-08-17-engine.md
      // The script-path form of the same class: cited as a whole release's verification.
      'Verification is `node scripts/doctor.mjs` — thirteen checks, thirteen green.',
      // Must NOT be flagged: `enforcee audit CLAUDE.md` names a real command; an earlier
      // draft of this checker read the SECOND word and reported a subcommand named `CLAUDE`.
      'Grade an answer with `enforcee audit CLAUDE.md out.md`.',
      // Must NOT be flagged: `cli/cli` is the GitHub CLI repository, quoted in the market
      // recon log. It is not a path in this repo and never was.
      'The `cli/cli` issue #14075 is still open.',
    ].join('\n\n')
  );
  writeFileSync(join(dir, 'nested', 'PLAN-SOMETHING.md'), 'CHANGE 6 — `enforcee onboard` — **SHIPPED 2026-08-17**\n');

  const external = scan(dir, ROOT);

  it('walks a directory that is not the repository', () => {
    expect(external.files.sort()).toEqual(['01-INDEX.md', 'nested/PLAN-SOMETHING.md']);
  });

  it('flags every mechanism the project docs claimed and never built', () => {
    const all = Object.values(external.results)
      .flatMap((r) => r.missing)
      .join('\n');
    expect(all).toContain('npm run ci:status');
    expect(all).toContain('scripts/doctor.mjs');
    expect(all).toContain('npm run doctor');
    expect(all).toContain('enforcee onboard');
  });

  it('does not manufacture a claim out of an argument or a foreign repo name', () => {
    const all = Object.values(external.results)
      .flatMap((r) => r.missing)
      .join('\n');
    expect(all, '`enforcee audit CLAUDE.md` was read as a subcommand named CLAUDE').not.toContain('CLAUDE');
    expect(all, '`cli/cli` is the GitHub CLI repo, not a path here').not.toContain('cli/cli');
  });

  it('refuses to call a scan clean when it examined nothing', () => {
    // A wrongly-pathed directory reports zero failures, which is indistinguishable from a
    // clean tree. The empty scan must be visibly empty.
    const empty = scan(mkdtempSync(join(tmpdir(), 'enforcee-doc-claims-empty-')), ROOT);
    const examined = Object.values(empty.results).reduce((n, r) => n + r.examined, 0);
    expect(empty.files).toEqual([]);
    expect(examined).toBe(0);
  });
});
