import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * WHAT THIS CANNOT DO, stated rather than implied: it reads the markdown IN THIS
 * REPOSITORY. The three instances above were all written into the claude.ai project docs,
 * which are not here and cannot be reached from a test. This stops the class from spreading
 * into the repo — README, CLAUDE.md, docs/, the plan files — and it is not a substitute for
 * the project-level check that does not exist yet.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function markdown(dir = '.', out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const rel = dir === '.' ? entry.name : join(dir, entry.name);
    if (entry.isDirectory()) markdown(rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}

// `.enforcee/` is generated output, not authored prose — it records what a run produced and
// is rewritten on every dogfood. Everything a human or a model would read is in scope.
const docs = markdown().filter((f) => !f.startsWith('.enforcee'));

/**
 * Docs whose job is to describe what does NOT exist yet. They are exempt from "every
 * command must exist" and subject instead to the stricter rule that they may not tick one
 * off. Named by pattern rather than listed, so a new plan cannot be smuggled past by a
 * filename nobody added to a list.
 */
const PLAN_DOCS = docs.filter((f) => /^PLAN-[A-Z-]+\.md$/.test(f));
const text = new Map(docs.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** Every `cmd === 'x'` branch the CLI actually dispatches, read from the source. */
const CLI_COMMANDS = new Set(
  [...readFileSync(join(ROOT, 'cli', 'index.ts'), 'utf8').matchAll(/cmd === '([a-z-]+)'/g)].map((m) => m[1])
);

describe('the scan covers something, so an empty one cannot pass', () => {
  // Rule 9: a checker needs a control before the thing it checks does. Two scans on this
  // project silently matched zero rules and every assertion passed over the empty result.
  it('found the docs a session actually reads', () => {
    expect(docs.length, 'the markdown walk returned nothing').toBeGreaterThan(10);
    for (const required of ['README.md', 'CLAUDE.md', join('docs', 'THE-CYCLE.md')]) {
      expect(docs, `${required} is not in the scan`).toContain(required);
    }
  });

  it('read the CLI dispatch table rather than a hardcoded list', () => {
    expect(CLI_COMMANDS.size, 'no commands parsed out of cli/index.ts — the shape changed').toBeGreaterThan(8);
    for (const c of ['audit', 'guard', 'obstacles']) {
      expect(CLI_COMMANDS.has(c), `${c} is missing from the parsed dispatch table`).toBe(true);
    }
  });
});

describe('every mechanism named in a repo doc exists', () => {
  it('every `npm run <script>` is a script in package.json', () => {
    const missing: string[] = [];
    let found = 0;
    for (const [f, body] of text) {
      for (const m of body.matchAll(/`?npm run ([a-z][\w:-]*)/g)) {
        found++;
        if (!pkg.scripts[m[1]]) missing.push(`${f}: npm run ${m[1]}`);
      }
    }
    expect(found, 'no `npm run` reference found in any doc — this rule now checks nothing').toBeGreaterThan(5);
    expect(
      missing,
      'a doc tells the reader to run a script that does not exist. Add the script, or correct the doc — ' +
        'a session that trusts it spends its budget deciding whether the failure is the environment.'
    ).toEqual([]);
  });

  it('every `enforcee <command>` a doc tells you to run is one the CLI dispatches', () => {
    const missing: string[] = [];
    let found = 0;
    for (const [f, body] of text) {
      if (PLAN_DOCS.includes(f)) continue; // planned by name and by content — see the rule below
      // Only an INSTRUCTION counts: inside backticks, after a `$` prompt, or after `npx`.
      // Bare prose ("turn this workflow of enforcee into a cycle") is not someone telling
      // you to run something, and flagging it would be a lint teaching the wrong lesson —
      // a mistake already made once on this repo and recorded in portability.test.ts.
      for (const m of body.matchAll(/(?:`|\$ |npx )(?:npx )?enforcee ([a-z][a-z-]*)/g)) {
        found++;
        if (!CLI_COMMANDS.has(m[1])) missing.push(`${f}: enforcee ${m[1]}`);
      }
    }
    expect(found, 'no `enforcee <cmd>` instruction found in any doc — this rule now checks nothing').toBeGreaterThan(5);
    expect(
      missing,
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
    const SHIPPED = /\bshipped\b|\bdone\b|✅|\[x\]/i;
    const missing: string[] = [];
    let claims = 0;
    for (const f of PLAN_DOCS) {
      for (const line of (text.get(f) ?? '').split('\n')) {
        if (!SHIPPED.test(line)) continue;
        for (const m of line.matchAll(/`?(?:npx )?enforcee ([a-z][a-z-]*)/g)) {
          claims++;
          if (!CLI_COMMANDS.has(m[1])) missing.push(`${f}: claims "enforcee ${m[1]}" is done — ${line.trim().slice(0, 96)}`);
        }
      }
      for (const line of (text.get(f) ?? '').split('\n')) {
        if (!SHIPPED.test(line)) continue;
        for (const m of line.matchAll(/`npm run ([a-z][\w:-]*)`/g)) {
          claims++;
          if (!pkg.scripts[m[1]]) missing.push(`${f}: claims "npm run ${m[1]}" is done — ${line.trim().slice(0, 96)}`);
        }
      }
    }
    expect(PLAN_DOCS.length, 'no plan docs found — the rule below checks nothing').toBeGreaterThan(0);
    expect(claims, 'no shipped-claim naming a mechanism found in any plan — verify the pattern still matches').toBeGreaterThan(0);
    expect(missing, 'a plan ticks off a mechanism that is not in this repository').toEqual([]);
  });

  it('every script path a doc tells you to run is a file that exists', () => {
    const missing: string[] = [];
    let found = 0;
    for (const [f, body] of text) {
      for (const m of body.matchAll(/(?:node|bash|sh) ((?:scripts|cli|guard)\/[\w./-]+\.(?:mjs|js|sh))/g)) {
        found++;
        if (!existsSync(join(ROOT, m[1]))) missing.push(`${f}: ${m[1]}`);
      }
    }
    // Named rather than numeric: a threshold picked to pass today drifts into meaninglessness,
    // whereas a doc we know contains such a path either still does or the walk broke.
    expect(found, 'no runnable script path found in any doc — this rule now checks nothing').toBeGreaterThan(0);
    expect(
      [...text].some(([, b]) => /node cli\/dist\/enforcee\.mjs/.test(b)),
      'the known script-path reference in docs/LICENCE-KEY.md is gone — the walk or the docs changed'
    ).toBe(true);
    expect(
      missing,
      'a doc names a script to run and the file is not there. `node scripts/sabotage.mjs` was cited as ' +
        'the verification for an entire release while the file existed only in a container that was reclaimed.'
    ).toEqual([]);
  });
});
