import type { Precondition } from './preconditions';
import type { Rule } from '../types';

/**
 * Derive preconditions from rules a person already wrote.
 *
 * A design constraint, not a nicety: if preconditions have to be hand-authored, nobody will
 * author them, and the layer is dead on arrival. So they are read out of the ruleset or plan
 * that exists.
 *
 * Deliberately conservative. A precondition we invent and then report as unmet is a false
 * alarm, and a preflight that cries wolf gets switched off — after which it protects nothing.
 * Only inferences with an unambiguous textual basis are made, and each one records the
 * fragment it came from so the person can see why it was asked for.
 */

export interface InferredPrecondition extends Precondition {
  /** The exact text this was inferred from. Shown so an inference can be argued with. */
  from: string;
  ruleId: string;
}

/** Commands a rule can name that imply the tool must exist. */
const TOOL_HINTS: { re: RegExp; bin: (m: RegExpMatchArray) => string }[] = [
  { re: /\b(npm|pnpm|yarn|bun)\b\s+(?:run\s+)?[\w:-]+/i, bin: (m) => m[1].toLowerCase() },
  { re: /\b(git|docker|kubectl|terraform|make|cargo|go|python3?|pip3?|ruby|java|dotnet)\b\s+[\w:-]/i, bin: (m) => m[1].toLowerCase() },
  { re: /\b(eslint|prettier|tsc|vitest|jest|pytest|mypy|ruff|black)\b/i, bin: (m) => m[1].toLowerCase() },
];

/**
 * A bare backticked command, with a run verb nearby.
 *
 * The original TOOL_HINTS all required the tool to be followed by an argument, which missed
 * the case this whole layer was built for: "Always run `dig` to confirm a domain is free."
 * `dig` alone matched nothing, so no precondition was raised, so the missing tool went
 * unnoticed — exactly the failure again, in the code meant to prevent it.
 *
 * The run verb is what keeps this conservative. A backticked word on its own is often a
 * filename or a flag; a backticked word next to "run", "execute" or "invoke" is a command.
 */
const RUN_VERB = /\b(run|runs|running|execute|executes|invoke|invokes|call|calls|use|uses)\b/i;
const BARE_COMMAND = /`([a-z][\w-]{1,20})`/g;

/** A backticked or quoted path that looks like a file the rule depends on. */
const PATH_RE = /[`"']([\w./-]+\.(?:json|ya?ml|toml|md|ts|tsx|js|mjs|cjs|py|sql|env|lock))[`"']/g;

/** An environment variable named in SCREAMING_SNAKE_CASE. */
const ENV_RE = /\b([A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+){1,6})\b/g;

/** Words that make a mention hypothetical rather than a dependency. */
const HYPOTHETICAL = /\b(example|e\.g\.|such as|for instance|like|imagine|suppose|hypothetical|sample)\b/i;

export function inferPreconditions(rules: Rule[]): InferredPrecondition[] {
  const out: InferredPrecondition[] = [];
  const seen = new Set<string>();

  const add = (p: InferredPrecondition) => {
    const key = `${p.kind}:${p.target}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  for (const rule of rules) {
    const text = rule.text;
    // "run something like `npm test`" names a tool as an illustration, not a dependency.
    if (HYPOTHETICAL.test(text)) continue;

    for (const { re, bin } of TOOL_HINTS) {
      const m = text.match(re);
      if (m) {
        add({
          kind: 'binary',
          target: bin(m),
          why: `named in a rule: "${text.slice(0, 70)}"`,
          from: m[0],
          ruleId: rule.id,
        });
      }
    }

    if (RUN_VERB.test(text)) {
      for (const m of text.matchAll(BARE_COMMAND)) {
        const name = m[1];
        // A path is handled below; a bare word with a dot is not a command.
        if (name.includes('.')) continue;
        add({
          kind: 'binary',
          target: name,
          why: `a rule says to run it: "${text.slice(0, 70)}"`,
          from: m[0],
          ruleId: rule.id,
        });
      }
    }

    for (const m of text.matchAll(PATH_RE)) {
      add({ kind: 'file', target: m[1], why: `referenced by a rule: "${text.slice(0, 70)}"`, from: m[0], ruleId: rule.id });
    }

    for (const m of text.matchAll(ENV_RE)) {
      // Skip acronyms that are not variables — HTTP, JSON, API on their own carry no underscore,
      // which the pattern already requires, but a few compound words still slip through.
      if (/^(HTTP_|WWW_)/.test(m[1])) continue;
      add({ kind: 'env', target: m[1], why: `required by a rule: "${text.slice(0, 70)}"`, from: m[1], ruleId: rule.id });
    }
  }

  return out;
}

/**
 * Rules that ask whether an ACTION happened, which no reading of a text output can settle.
 *
 * Measured on the HANDBOOK corpus of real enterprise SOPs: 731 of the un-decidable rules are
 * this shape — escalate within 24 hours, verify the W-9 before payment, obtain a second
 * approval. They are not "judged rather than deterministic"; they are unanswerable from text
 * by anyone, and saying so is more honest than sending them to a model that will guess.
 */
const ACTION_RE =
  /\b(escalate|notify|approve|approval|verify|confirm|obtain|submit|file|record|log|route|assign|review|sign|archive|retain|deploy|publish|revoke|rotate|back ?up|within \d+\s*(?:minutes?|hours?|days?)|no later than|prior to|before proceeding)\b/i;

export function actionShaped(rules: Rule[]): Rule[] {
  return rules.filter((r) => ACTION_RE.test(r.text));
}
