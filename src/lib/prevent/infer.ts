import type { Precondition } from './preconditions';
import type { Rule } from '../types';
import { classify } from '../rules/parse';

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
const NEGATIVE = /\b(never|not|don't|do not|avoid|no|forbid|without|must not|refrain)\b/i;
const POSITIVE = /\b(always|must|ensure|make sure|require[ds]?|should|need to)\b/i;

export interface Clause {
  text: string;
  start: number;
  end: number;
  negative: boolean;
  hypothetical: boolean;
}

/**
 * Cut a rule into clauses, each carrying its own polarity and its own hypothetical-ness.
 *
 * Both flags used to be measured over the WHOLE rule, and one word anywhere in it decided
 * everything. "Always run `dig` to check a domain, not something like `whois`" contains
 * both "not" and "like", so every precondition in it was dropped — including the `dig` that
 * this entire layer exists because of. The dropped inference is silent, which makes it the
 * same failure shape as the missing tool it was meant to catch.
 *
 * Scope carries FORWARD across commas and resets at a sentence break, because that is how
 * English works: "Never use `foo`, `bar`, or `baz`" forbids all three, and treating the
 * later items as unscoped would turn a prohibition into a demand.
 */
export function clauses(text: string): Clause[] {
  const out: Clause[] = [];
  let neg = false;
  let hypo = false;
  let at = 0;

  // Split on commas, semicolons, dashes and sentence ends, keeping offsets.
  const re = /[;.]|\s+[—–-]\s+|,\s*/g;
  const pieces: { text: string; start: number; reset: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    pieces.push({ text: text.slice(at, m.index), start: at, reset: /[;.]/.test(m[0]) });
    at = m.index + m[0].length;
  }
  pieces.push({ text: text.slice(at), start: at, reset: false });

  for (const p of pieces) {
    if (!p.text.trim()) continue;
    if (NEGATIVE.test(p.text)) neg = true;
    else if (POSITIVE.test(p.text)) neg = false;
    if (HYPOTHETICAL.test(p.text)) hypo = true;
    else if (POSITIVE.test(p.text)) hypo = false;

    out.push({ text: p.text, start: p.start, end: p.start + p.text.length, negative: neg, hypothetical: hypo });
    if (p.reset) {
      neg = false;
      hypo = false;
    }
  }
  return out;
}

function clauseAt(cs: Clause[], index: number): Clause | undefined {
  return cs.find((c) => index >= c.start && index < c.end) ?? cs[cs.length - 1];
}

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
    const cs = clauses(text);

    // A rule that FORBIDS something does not require it to be present, and an illustration
    // is not a dependency — but both are decided per clause now, not per rule.
    //
    // "Never log or commit `DATABASE_URL`" made preflight demand that DATABASE_URL be
    // exported into the shell, and fail CI until it was — a security ruleset producing a
    // demand to put production secrets in the environment. Polarity was never consulted.
    const usable = (index: number) => {
      const c = clauseAt(cs, index);
      return c ? !c.negative && !c.hypothetical : true;
    };

    for (const { re, bin } of TOOL_HINTS) {
      const m = text.match(re);
      if (m && usable(m.index ?? 0)) {
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
        if (!usable(m.index ?? 0)) continue;
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
      if (!usable(m.index ?? 0)) continue;
      add({ kind: 'file', target: m[1], why: `referenced by a rule: "${text.slice(0, 70)}"`, from: m[0], ruleId: rule.id });
    }

    for (const m of text.matchAll(ENV_RE)) {
      // Skip acronyms that are not variables — HTTP, JSON, API on their own carry no underscore,
      // which the pattern already requires, but a few compound words still slip through.
      if (/^(HTTP_|WWW_)/.test(m[1])) continue;
      if (!usable(m.index ?? 0)) continue;
      add({ kind: 'env', target: m[1], why: `required by a rule: "${text.slice(0, 70)}"`, from: m[1], ruleId: rule.id });
    }
  }

  return out;
}

/**
 * Rules that ask whether an ACTION happened, which no reading of a text output can settle.
 *
 * Delegates to classify() rather than carrying its own pattern. It used to have one, and the
 * two definitions immediately disagreed: an audit reported two action rules UNVERIFIABLE
 * while preflight listed none, on the same file, in the same minute. Ninth instance of one
 * idea living in two places on this project.
 *
 * The classifier is the right home because it already has to make this decision to keep the
 * literal checker off these rules — the false-accusation fix. Everything else reads it.
 */
export function actionShaped(rules: Rule[]): Rule[] {
  return rules.filter((r) => classify(r.text).kind === 'action');
}
