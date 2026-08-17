#!/usr/bin/env node
/**
 * THE RULES FOR "DOES THIS DOCUMENT DESCRIBE A MECHANISM THAT EXISTS?" — one copy.
 *
 * `tests/doc-claims.test.ts` made this a control for markdown IN this repository, and stated
 * its own limit plainly: *"it reads the markdown IN THIS REPOSITORY. The three instances
 * above were all written into the claude.ai project docs, which are not here and cannot be
 * reached from a test… it is not a substitute for the project-level check that does not
 * exist yet."*
 *
 * That missing half is where every recorded instance of the class actually happened. As of
 * 2026-08-17 the project docs assert SIX mechanisms that have never existed in this
 * repository's history — verified with `git log --all --oneline -- <path>`, zero commits each:
 *
 *     tests/doc-claims.test.ts     scripts/sabotage.mjs        tests/spawn-honesty.test.ts
 *     tests/helpers/spawn.ts       src/lib/onboard.ts          tests/licence-route-expiry.test.ts
 *
 * …plus `npm run ci:status` and `enforcee onboard`. Two of those are asserted by `01-INDEX.md`
 * itself, the doc every session is instructed to read first, in the same paragraph that says
 * the project half "is the next control to build, and it is the single highest-value item on
 * the list."
 *
 * A test cannot reach the project docs, but a script can be pointed at them once a run has
 * dumped them to disk:
 *
 *     npm run doc-claims -- /path/to/dumped/project-docs
 *
 * So the rules live here, the test imports them, and the scheduled jobs run the same rules
 * over the docs that live outside the tree. ONE copy: E-1, the duplicated-source class, is at
 * twelve instances on this project and a second regex for these rules would be the thirteenth.
 *
 * COVERAGE IS REPORTED, ALWAYS (charter honesty rule 9 / INVARIANTS E-3). Two scans on this
 * project silently matched zero rules and every assertion passed over the empty result. Each
 * rule returns how many claims it examined so the caller can refuse a clean report from a
 * scan that parsed nothing.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'npm-dist']);

/** Markdown under `root`, paths relative to `root`, POSIX separators, build output excluded. */
export function markdownFiles(root, dir = '.', out = []) {
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = dir === '.' ? entry.name : join(dir, entry.name);
    if (entry.isDirectory()) markdownFiles(root, rel, out);
    else if (entry.name.endsWith('.md')) out.push(rel.split(sep).join('/'));
  }
  return out;
}

/** What the repository actually provides: npm scripts and CLI subcommands, read from source. */
export function repoMechanisms(repoRoot) {
  const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts ?? {};
  const cli = readFileSync(join(repoRoot, 'cli', 'index.ts'), 'utf8');
  const commands = new Set([...cli.matchAll(/cmd === '([a-z-]+)'/g)].map((m) => m[1]));
  return { scripts, commands, exists: (p) => existsSync(join(repoRoot, p)) };
}

/**
 * Only an INSTRUCTION counts: inside backticks, after a `$` prompt, or after `npx`. Bare
 * prose ("turn this workflow of enforcee into a cycle") is not someone telling you to run
 * something, and flagging it would be a lint teaching the wrong lesson — a mistake already
 * made once on this repo and recorded in tests/portability.test.ts.
 */
const ENFORCEE_INSTRUCTION = /(?:`|\$ |npx )(?:npx )?enforcee ([a-z][a-z-]*)/g;
const NPM_RUN = /`?npm run ([a-z][\w:-]*)/g;
const SCRIPT_PATH = /(?:node|bash|sh) ((?:scripts|cli|guard)\/[\w./-]+\.(?:mjs|js|sh))/g;
/** A tick-box is a claim about the repository, so it gets checked against the repository. */
export const SHIPPED = /\bshipped\b|\bdone\b|✅|\[x\]/i;
/** Docs whose job is to describe what does not exist yet. Matched by pattern, not by a list. */
export const isPlanDoc = (f) => /(^|\/)PLAN-[A-Z-]+\.md$/.test(f);

/**
 * Run every rule over `docs` (a Map of relative path → text) against `mech`.
 * Returns one entry per rule: `{ examined, missing[] }`.
 * `examined` is the coverage number; `missing` are the unbacked claims.
 */
export function rules(docs, mech) {
  const out = {
    'npm-script': { examined: 0, missing: [] },
    'cli-command': { examined: 0, missing: [] },
    'plan-tick-off': { examined: 0, missing: [] },
    'script-path': { examined: 0, missing: [] },
  };

  for (const [f, body] of docs) {
    for (const m of body.matchAll(NPM_RUN)) {
      out['npm-script'].examined++;
      if (!mech.scripts[m[1]]) out['npm-script'].missing.push(`${f}: npm run ${m[1]}`);
    }

    // A plan may name an unbuilt command; that is what a plan is for. What it may not do is
    // tick one off — `enforcee onboard` was written up as SHIPPED at 0.10.0 in the doc every
    // session reads first, and it is not on main.
    if (!isPlanDoc(f)) {
      for (const m of body.matchAll(ENFORCEE_INSTRUCTION)) {
        out['cli-command'].examined++;
        if (!mech.commands.has(m[1])) out['cli-command'].missing.push(`${f}: enforcee ${m[1]}`);
      }
    } else {
      for (const line of body.split('\n')) {
        if (!SHIPPED.test(line)) continue;
        for (const m of line.matchAll(/`?(?:npx )?enforcee ([a-z][a-z-]*)/g)) {
          out['plan-tick-off'].examined++;
          if (!mech.commands.has(m[1])) {
            out['plan-tick-off'].missing.push(`${f}: claims "enforcee ${m[1]}" is done — ${line.trim().slice(0, 96)}`);
          }
        }
        for (const m of line.matchAll(/`npm run ([a-z][\w:-]*)`/g)) {
          out['plan-tick-off'].examined++;
          if (!mech.scripts[m[1]]) {
            out['plan-tick-off'].missing.push(`${f}: claims "npm run ${m[1]}" is done — ${line.trim().slice(0, 96)}`);
          }
        }
      }
    }

    for (const m of body.matchAll(SCRIPT_PATH)) {
      out['script-path'].examined++;
      if (!mech.exists(m[1])) out['script-path'].missing.push(`${f}: ${m[1]}`);
    }
  }
  return out;
}

/** Read `docsRoot`, run every rule against the repo at `repoRoot`. */
export function scan(docsRoot, repoRoot) {
  const files = markdownFiles(docsRoot).filter((f) => !f.startsWith('.enforcee'));
  const docs = new Map(files.map((f) => [f, readFileSync(join(docsRoot, f), 'utf8')]));
  return { files, docs, results: rules(docs, repoMechanisms(repoRoot)) };
}

// ── CLI: the half a test cannot reach ────────────────────────────────────────
//
//   npm run doc-claims -- <docsRoot> [--repo <path>] [--min <claims>]
//
// `--min` is the coverage floor. A scan of an empty or wrongly-pathed directory reports zero
// failures, which is indistinguishable from a clean one; below the floor this exits 2.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const argv = process.argv.slice(2);
  const flag = (name, dflt) => {
    const i = argv.indexOf(name);
    return i === -1 ? dflt : argv[i + 1];
  };
  const repoRoot = flag('--repo', process.cwd());
  const min = Number(flag('--min', '0'));
  const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  const docsRoot = positional[0] ?? repoRoot;

  const { files, results } = scan(docsRoot, repoRoot);
  let examined = 0;
  let failures = 0;
  for (const [rule, r] of Object.entries(results)) {
    examined += r.examined;
    failures += r.missing.length;
    console.log(`${rule}: ${r.examined} examined, ${r.missing.length} unbacked`);
    for (const m of r.missing) console.log(`    ${m}`);
  }
  console.log(`\nCOVERAGE: ${examined} mechanism claims across ${files.length} markdown files in ${docsRoot}`);
  if (examined < min) {
    console.error(`COVERAGE TOO LOW: ${examined} < ${min}. A scan that parsed nothing is not a clean scan.`);
    process.exit(2);
  }
  console.log(failures ? `${failures} unbacked claim(s).` : 'No unbacked claims.');
  process.exit(failures ? 1 : 0);
}
