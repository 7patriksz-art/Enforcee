#!/usr/bin/env node
/**
 * Install Enforcee on Enforcee.
 *
 * `76-ENGINE-PLAN-2026-08-15.md` Part 0 opened with the finding that reframed the rest of it:
 *
 *     .claude/  does not exist
 *     Enforcee is not installed on Enforcee.
 *
 * We ship a hook that blocks a forbidden action before it runs, and we were building the
 * product with no hook — which is not an oversight, it is the loudest possible statement
 * about whether we believe our own product. This script closes that.
 *
 * WHAT IT DOES
 *
 * Compiles `CLAUDE.md` into `.enforcee/policy.json` using the SAME library functions the
 * shipped CLI uses — `parseRuleset` → `proposeDenyRules` → `compilePolicy`. It does not
 * re-implement any of it, because a second copy of the compiler would drift from the first
 * and this project has produced ten duplicated-source bugs already (INVARIANTS E-1).
 *
 * WHY NOT JUST RUN `enforcee guard CLAUDE.md`
 *
 * That command is licence-gated — it is the paid surface, and correctly so. We hold the repo
 * rather than a subscription, so the dev path uses the library directly. The gate stays
 * exactly where it is for everyone who is not this repository; nothing here weakens it, and
 * `.enforcee/` is gitignored so no compiled policy or licence is ever committed.
 *
 * WHAT THIS BUYS US WITHOUT A LICENCE — verified 2026-08-16 by running the real guard:
 *
 *   - InstructionsLoaded is recorded: `.enforcee/loaded.json` gets a per-session entry.
 *     Load evidence sits ABOVE the licence gate on purpose — free inspects, paid enforces —
 *     so we get OBSERVED evidence of which rule files actually reached the model.
 *   - Every decision is appended to `.enforcee/ledger.jsonl`.
 *   - Enforcement (deny / warn) stays OFF and says so, once, without blocking anything.
 *     Set ENFORCEE_LICENCE to turn it on. That is D-007 behaving exactly as designed, and
 *     watching it do so on our own repo is itself the demonstration.
 *
 * COVERAGE, BECAUSE A CHECK THAT SILENTLY COVERS NOTHING IS THE FAILURE MODE HERE
 *
 * Three checks on this project have passed over zero data (INVARIANTS E-3). This script
 * reports how many rules it parsed and how many compiled into the policy, and EXITS NON-ZERO
 * when either is implausibly low — so a parser regression that quietly empties the policy
 * turns the dogfood step red instead of installing a guard that guards nothing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRuleset } from '../src/lib/rules/parse.ts';
import { proposeDenyRules, compilePolicy, toDenyRule } from '../src/lib/enforce/policy.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = join(ROOT, 'CLAUDE.md');

/**
 * Floors, not targets. They exist to catch a collapse — a parser change that drops every
 * prose rule, an empty CLAUDE.md, a compiler that proposes nothing — not to police the
 * ruleset's size. Raise them only with a measurement in the log saying why.
 */
const MIN_RULES = 20;
const MIN_POLICY = 1;

const ruleset = readFileSync(RULES, 'utf8');
const { rules } = parseRuleset(ruleset, 'CLAUDE.md');
const proposals = proposeDenyRules(rules);
const on = proposals.filter((p) => p.defaultOn);
const deny = on.filter((p) => p.severity === 'deny').map(toDenyRule);
const warn = on.filter((p) => p.severity === 'warn').map(toDenyRule);
/**
 * Repo-specific denies, merged in.
 *
 * `proposeDenyRules` draws from two sources and labels each honestly in `basis`: the user's
 * own rules where they were specific enough to enforce, and Enforcee's standing library of
 * destructive operations. Measured here on 2026-08-16: CLAUDE.md's 26 rules contributed
 * **zero** proposals beyond the standing library's 19 — parsing 0 rules produced the same 19.
 * Our rules are prose obligations ("use a control", "report your denominator"), which the
 * audit layer can grade and a regex cannot.
 *
 * So the guard we install on ourselves enforces the standing library. That is not a defect —
 * it is the design, stated in the code — but it is worth knowing, and it left one real gap:
 * `npm publish` was denied and `git tag v0.9.0` was not, on a repo where the tag IS the
 * release. These close that gap here without changing the standing library, which would
 * change behaviour for every customer and is not a run's decision to make.
 */
const extraPath = join(ROOT, '.enforcee-repo-rules.json');
let extraDeny = [];
try {
  const raw = JSON.parse(readFileSync(extraPath, 'utf8'));
  extraDeny = Array.isArray(raw.deny) ? raw.deny : [];
} catch (e) {
  console.error(`Refusing to install: ${extraPath} is missing or unreadable (${e.message}).`);
  console.error('It is tracked in git and carries the repo-specific denies. A silent skip here would');
  console.error('install a guard that no longer blocks release tags, and nothing would say so.');
  process.exit(1);
}

const policy = compilePolicy(ruleset, rules, [...deny, ...extraDeny], warn);

const total = deny.length + extraDeny.length + warn.length;
console.log(
  `CLAUDE.md → ${rules.length} rules parsed · ${proposals.length} enforceable proposals · ` +
    `${deny.length} deny + ${extraDeny.length} repo-specific + ${warn.length} warn compiled.`
);

if (rules.length < MIN_RULES) {
  console.error(
    `Refusing to install: only ${rules.length} rules parsed from CLAUDE.md, expected at least ${MIN_RULES}. ` +
      `A policy compiled from a ruleset that failed to parse is a guard that guards nothing, and it would ` +
      `install silently and pass every check.`
  );
  process.exit(1);
}
if (total < MIN_POLICY) {
  console.error(
    `Refusing to install: ${rules.length} rules parsed but ${total} compiled into the policy. ` +
      `Every proposal was filtered out, so the guard would enforce nothing while appearing installed.`
  );
  process.exit(1);
}

mkdirSync(join(ROOT, '.enforcee'), { recursive: true });
writeFileSync(join(ROOT, '.enforcee', 'policy.json'), JSON.stringify(policy, null, 2));
console.log(`Wrote .enforcee/policy.json — ${deny.length + extraDeny.length} blocking, ${warn.length} warning.`);
console.log(
  process.env.ENFORCEE_LICENCE
    ? 'ENFORCEE_LICENCE is set — enforcement is ON for sessions in this repo.'
    : 'No ENFORCEE_LICENCE — load evidence and the ledger record; enforcement stays OFF and says so.'
);
