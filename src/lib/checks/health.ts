import type { HealthFinding, Rule } from '../types';
import { findDuplicates, skippedLines, isUnenforceable } from '../rules/parse';

export const HEALTH_VERSION = 'health@1.0.0';

/** Jaccard similarity over word sets — cheap, deterministic near-duplicate detection. */
function similarity(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter((w) => w.length > 2));
  const wb = new Set(b.split(' ').filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

const POSITIVE = /\b(always|must|should|ensure|require[ds]?|include|use)\b/i;
const NEGATIVE = /\b(never|don't|do not|must not|avoid|omit|exclude|refrain|no)\b/i;

/** Verbs so common they carry no topical signal on their own. */
const GENERIC = new Set([
  'use', 'used', 'using', 'include', 'includes', 'write', 'writes', 'make', 'makes',
  'keep', 'keeps', 'give', 'gives', 'add', 'adds', 'put', 'set', 'reply', 'respond',
  'answer', 'answers', 'output', 'outputs', 'every', 'all', 'any', 'your', 'their',
]);

const POLARITY_AND_FILLER =
  /\b(always|never|must not|must|should not|should|don't|do not|cannot|can't|avoid|omit|exclude|refrain from|ensure|please|you|the|a|an|to|in|of|and|or|for|with|that|this|it|is|are|be)\b/g;

/** Content words a rule is actually about, with polarity and filler stripped. */
function subjectWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(POLARITY_AND_FILLER, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

/** Overlap coefficient — asymmetric on purpose: a short rule fully inside a longer one counts. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

function sharedTopical(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const w of a) if (b.has(w) && !GENERIC.has(w)) out.push(w);
  return out;
}

export interface HealthOptions {
  /** Rules sitting past this fraction of the ruleset are flagged as buried. */
  buriedAfter?: number;
  /** Total ruleset tokens above this get an oversized warning. */
  oversizedTokens?: number;
}

/**
 * Deterministic critique of the ruleset itself. No model call, no output needed.
 * This runs before any audit and is the free, instant half of the product.
 */
export function runHealth(
  rules: Rule[],
  rulesetText: string,
  totalTokens: number,
  opts: HealthOptions = {}
): HealthFinding[] {
  const buriedAfter = opts.buriedAfter ?? 0.75;
  const oversizedTokens = opts.oversizedTokens ?? 6000;
  const findings: HealthFinding[] = [];

  // 0. Nothing was extracted.
  //
  // An empty rule list produced a receipt reading 0 violations, 0 unverifiable, 100%
  // coverage — a perfect score, printed in green, for a file the parser could make no sense
  // of. Every other cap and refusal in this module reports what it skipped for exactly this
  // reason, and the largest possible skip had no message at all. A misnamed file, a PDF
  // pasted as text, a ruleset written entirely in prose the splitter does not accept: all
  // of them looked like flawless compliance.
  if (rules.length === 0) {
    const hasText = rulesetText.trim().length > 0;
    findings.push({
      code: 'no_rules',
      severity: 'error',
      ruleIds: [],
      message: hasText
        ? `No rules could be extracted from this file, so nothing was checked. The green result below is the absence of a question, not an answer. Rules are read from bullets, numbered items and directive sentences — if yours are written another way, they were not seen.`
        : `The ruleset is empty, so nothing was checked. This is not a pass.`,
    });
  }

  // 0b. Bullets the splitter declined.
  //
  // Dropping a line is a decision about someone's ruleset, and every other decision in this
  // module reports itself. This one did not, so a handbook could lose most of its
  // obligations to a formatting heuristic and still print a clean receipt.
  const skipped = skippedLines(rulesetText);
  if (skipped.length) {
    findings.push({
      code: 'lines_skipped',
      severity: skipped.length >= rules.length ? 'warn' : 'info',
      ruleIds: [],
      message:
        `${skipped.length} bullet${skipped.length === 1 ? '' : 's'} did not look like a rule and ${skipped.length === 1 ? 'was' : 'were'} not checked ` +
        `(line${skipped.length === 1 ? '' : 's'} ${skipped.slice(0, 6).map((x) => x.line).join(', ')}${skipped.length > 6 ? '…' : ''}). ` +
        `Headings, table-of-contents entries and Title Case fragments are skipped on purpose — but if any of these are real rules, ` +
        `rewrite them as instructions ("Verify customer identity before issuing a refund") so they get checked. ` +
        `First: "${skipped[0].text.slice(0, 60)}"`,
    });
  }

  // 1. Exact duplicates (dropped from the rule list, recovered here).
  const dupes = findDuplicates(rulesetText);
  for (const rule of rules) {
    const n = dupes.get(rule.id) ?? 1;
    if (n > 1) {
      findings.push({
        code: 'duplicate',
        severity: 'warn',
        ruleIds: [rule.id],
        message: `This rule is stated ${n} times. Repetition costs tokens and does not increase compliance.`,
      });
    }
  }

  // 2. Contradictions and 3. near-duplicates.
  //
  // This comparison is inherently pairwise, so it is quadratic in the rule count, and
  // both the work and the output need a ceiling. A 120 KB ruleset — inside our own
  // documented input cap — parses to ~1,650 rules, which is 1.4 million pair findings,
  // a 233 MB receipt and an out-of-memory kill. Measured, not theorised.
  //
  // Two separate bounds, because they fail differently: PAIR_LIMIT bounds the CPU,
  // MAX_PAIR_FINDINGS bounds the response. Both report what they skipped — a silent cap
  // would read as "your ruleset is clean" when it means "we stopped looking".
  const PAIR_LIMIT = 400;
  const MAX_PAIR_FINDINGS = 200;

  const subjects = new Map(rules.map((r) => [r.id, subjectWords(r.text)]));
  const analysed = Math.min(rules.length, PAIR_LIMIT);

  if (rules.length > PAIR_LIMIT) {
    findings.push({
      code: 'ruleset_too_large',
      severity: 'warn',
      ruleIds: [],
      message: `This ruleset has ${rules.length} rules. Contradiction and duplicate detection compares every pair, so it was limited to the first ${PAIR_LIMIT} — the rest were not compared against each other. A ruleset this size is also very unlikely to be followed: adherence drops sharply with length, so the more useful fix is splitting it.`,
    });
  }

  let pairFindings = 0;
  outer: for (let i = 0; i < analysed; i++) {
    for (let j = i + 1; j < analysed; j++) {
      if (pairFindings >= MAX_PAIR_FINDINGS) {
        findings.push({
          code: 'pair_findings_truncated',
          severity: 'info',
          ruleIds: [],
          message: `Stopped after ${MAX_PAIR_FINDINGS} contradiction and duplicate findings. There are almost certainly more; fixing these will make the next pass more useful.`,
        });
        break outer;
      }
      const a = rules[i];
      const b = rules[j];

      const aNeg = NEGATIVE.test(a.text);
      const bNeg = NEGATIVE.test(b.text);
      const aPos = POSITIVE.test(a.text) && !aNeg;
      const bPos = POSITIVE.test(b.text) && !bNeg;
      const opposed = (aPos && bNeg) || (aNeg && bPos);

      const sa = subjects.get(a.id)!;
      const sb = subjects.get(b.id)!;
      const ov = overlap(sa, sb);
      const shared = sharedTopical(sa, sb);

      // Opposite polarity about the same topic. Requires a shared word that
      // actually names a topic, so "always use tables" vs "never use emojis"
      // does not trip on the word "use".
      if (opposed && ov >= 0.6 && shared.length >= 1) {
        findings.push({
          code: 'contradiction',
          severity: 'error',
          ruleIds: [a.id, b.id],
          message: `These two rules point in opposite directions about "${shared.join('", "')}". The model will silently pick one, and you will not be told which.`,
        });
        pairFindings++;
        continue;
      }

      const sim = similarity(a.normalized, b.normalized);
      if (!opposed && sim >= 0.75) {
        findings.push({
          code: 'near_duplicate',
          severity: 'info',
          ruleIds: [a.id, b.id],
          message: `These rules overlap heavily (${Math.round(sim * 100)}% word overlap). Consider merging them.`,
        });
        pairFindings++;
      }
    }
  }

  // 4. Unenforceable rules — nobody, human or machine, can audit these.
  for (const rule of rules) {
    if (isUnenforceable(rule.text)) {
      findings.push({
        code: 'unenforceable',
        severity: 'warn',
        ruleIds: [rule.id],
        message: 'This rule is too vague to verify. It cannot pass or fail an audit, so it buys you nothing.',
      });
    }
  }

  // 5. Buried rules — position in context correlates with being ignored.
  const buried = rules.filter((r) => r.position >= buriedAfter);
  if (buried.length >= 3) {
    findings.push({
      code: 'buried',
      severity: 'warn',
      ruleIds: buried.map((r) => r.id),
      message: `${buried.length} rules sit in the last ${Math.round((1 - buriedAfter) * 100)}% of the ruleset, where attention is weakest. Move the ones that matter to the top.`,
    });
  }

  // 6. Oversized ruleset.
  if (totalTokens > oversizedTokens) {
    findings.push({
      code: 'oversized',
      severity: 'warn',
      ruleIds: [],
      message: `The ruleset is roughly ${totalTokens.toLocaleString()} tokens. Past a few thousand, adherence degrades and every request pays the cost.`,
    });
  }

  return findings;
}
