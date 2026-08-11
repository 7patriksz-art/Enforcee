import type { PreferenceCandidate } from '../preferences';
import type { Rule } from '../types';

/**
 * What happens when something newly learned contradicts something already enforced.
 *
 * This is the hard part of any learning system, and getting it wrong is worse than not
 * learning at all. Two failures are possible and they are not symmetric:
 *
 *   - **Silently keeping the old rule.** The user changed their mind in March and the tool
 *     is still blocking on a preference they abandoned. They stop trusting it and switch it
 *     off. Recoverable, annoying.
 *   - **Silently applying the new one.** A rule the user deliberately set — possibly one that
 *     is *blocking commands in their guard* — quietly stops being enforced because a passing
 *     remark was read as a reversal. **Unrecoverable, because nothing tells them it happened.**
 *
 * So the rule is the one this project already runs on, from the charter's operating rules:
 * *"Append to the decisions log; never silently reverse a decision."* A contradiction is
 * surfaced with both sides quoted and dated. Nothing is deleted, nothing is auto-applied,
 * and the old rule keeps working until a person says otherwise.
 *
 * The bar scales with consequence. An audited rule only changes a verdict on a receipt. An
 * ENFORCED rule changes what gets blocked in a live session — so a contradiction there is
 * never auto-anything, no matter how many times the new preference was heard.
 */

export type Consequence = 'audited' | 'enforced';

export interface ExistingRule {
  id: string;
  text: string;
  /** Audited rules appear on a receipt. Enforced rules block tool calls. */
  consequence: Consequence;
  /** When the user established it, if known. Used to say "you said X in March". */
  since?: string;
  /** The user's own words, if this rule was itself learned. */
  quote?: string;
}

export type Disposition =
  /** Nothing like it exists. Safe to propose as new. */
  | { kind: 'new' }
  /** Already covered by an equivalent rule. Nothing to do. */
  | { kind: 'duplicate'; existing: ExistingRule }
  /** Directly contradicts something that already exists. Needs a person. */
  | { kind: 'contradicts'; existing: ExistingRule; why: string; autoApplicable: false };

export interface Proposal {
  candidate: PreferenceCandidate;
  disposition: Disposition;
  /** Times this preference has been heard. One mention is a remark; two is a pattern. */
  mentions: number;
  /** Written for the person, stating both sides when there is a conflict. */
  message: string;
}

/** Normalised subject of a rule — what it is *about*, ignoring whether it requires or forbids. */
const STOP = new Set([
  'never', 'always', 'must', 'not', 'do', "don't", 'should', 'avoid', 'prefer', 'use', 'no',
  'is', 'are', 'be', 'to', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'my', 'your',
  'it', 'that', 'this', 'fine', 'ok', 'okay', 'allowed', 'permitted',
]);

/** Significant words, crudely stemmed so "pushing" and "push" match. */
function subject(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
  );
}

/**
 * How much two rules are about the same thing, 0 to 1.
 *
 * Overlap rather than exact match, because a reversal is almost never phrased as the
 * negation of the original — "never force-push to a shared branch" is abandoned by saying
 * "force pushing is fine on my branches", which shares two words with it and no structure.
 */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

const NEGATIVE = /\b(never|not|don't|do not|avoid|no|forbid|without|exclude|omit)\b/i;

/**
 * Two rules contradict when they are about the same thing and point opposite ways.
 *
 * Deliberately narrow. A missed contradiction leaves the user with two rules and a visible
 * inconsistency they can resolve themselves. A FALSE contradiction interrupts them to
 * arbitrate a conflict that does not exist, and doing that even twice teaches them to click
 * through the prompt without reading — after which the mechanism protects nothing.
 */
const SAME_SUBJECT = 0.6;

function contradicts(a: string, b: string): boolean {
  if (NEGATIVE.test(a) === NEGATIVE.test(b)) return false;
  const sa = subject(a);
  const sb = subject(b);
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  const ratio = overlap(sa, sb);

  // Two shared significant words, OR one rule's subject entirely contained in the other's.
  //
  // The containment case exists because short rules are the common ones: "always use tabs"
  // against "never use tabs" shares exactly one significant word after stemming, and a flat
  // two-word floor threw away the most obvious contradiction there is.
  return (shared >= 2 || (ratio === 1 && shared >= 1)) && ratio >= SAME_SUBJECT;
}

function equivalent(a: string, b: string): boolean {
  if (NEGATIVE.test(a) !== NEGATIVE.test(b)) return false;
  return overlap(subject(a), subject(b)) >= 0.8;
}

export interface ProposeOptions {
  /** How many times a preference must be heard before it is offered at all. */
  minMentions?: number;
}

/**
 * Turn learned candidates into proposals, with anything contradictory held back for a person.
 *
 * `mentionsOf` is how many times each candidate's preference has been heard across the
 * user's history — one mention is a remark, two is a pattern. That threshold is Patrik's
 * ("if he mentions something even for the second time"), and it applies only to NEW rules.
 * A contradiction is never promoted by repetition, because repeating a new opinion is not
 * evidence that the old rule was wrong — only the person knows that.
 */
export function propose(
  candidates: PreferenceCandidate[],
  existing: ExistingRule[],
  mentionsOf: (c: PreferenceCandidate) => number,
  opts: ProposeOptions = {}
): Proposal[] {
  const minMentions = opts.minMentions ?? 2;

  return candidates.map((candidate) => {
    const mentions = mentionsOf(candidate);

    const dupe = existing.find((e) => equivalent(e.text, candidate.rule));
    if (dupe) {
      return {
        candidate,
        mentions,
        disposition: { kind: 'duplicate', existing: dupe },
        message: `Already covered by an existing rule. Nothing to change.`,
      };
    }

    const clash = existing.find((e) => contradicts(e.text, candidate.rule));
    if (clash) {
      const when = clash.since ? ` (set ${clash.since})` : '';
      const said = clash.quote ? ` — your words then: "${clash.quote}"` : '';
      const weight =
        clash.consequence === 'enforced'
          ? `That rule is ENFORCED: it currently blocks tool calls in your sessions. Changing it changes what gets stopped, so it will not be changed without you.`
          : `That rule is audited: it affects verdicts on your receipts, not what gets blocked.`;
      return {
        candidate,
        mentions,
        disposition: {
          kind: 'contradicts',
          existing: clash,
          autoApplicable: false,
          why: 'same subject, opposite polarity',
        },
        message:
          `This contradicts a rule you already have${when}: "${clash.text}"${said}. ` +
          `You now said: "${candidate.quote}". ${weight} ` +
          `Nothing has been changed or removed — pick which one you meant.`,
      };
    }

    return {
      candidate,
      mentions,
      disposition: { kind: 'new' },
      message:
        mentions >= minMentions
          ? `Heard ${mentions} times. Offered as a new rule.`
          : `Heard once. Held back until you say it again — a single remark is not a preference.`,
    };
  });
}

/**
 * Would the audit engine actually be able to check this rule?
 *
 * Snyk's Agent Fix does the equivalent before showing anything: "Before you even see a fix,
 * Snyk Agent Fix runs all generated auto-fixes through a Snyk Code SAST scan… If any fix
 * recommendation doesn't pass any of our SAST tests, we won't show it to you."
 *
 * Same principle, applied to a learned rule. Offering one that nothing can adjudicate hands
 * the user a rule that will report NOT_APPLICABLE or UNVERIFIABLE forever — which looks
 * identical to a rule being obeyed, and is the exact confusion this product exists to
 * remove. A rule we cannot check is worse than no rule, because it manufactures false
 * reassurance.
 */
export function selfCheckable(candidate: PreferenceCandidate): { ok: boolean; why: string } {
  if (candidate.check === 'judged') {
    return {
      ok: false,
      why: 'nothing in the engine can decide this one by code — it would need the judge every time, and may still come back unverifiable',
    };
  }
  return { ok: true, why: `checkable by code (${candidate.check})` };
}

/** Proposals safe to offer without arbitration: new, and heard enough times. */
export function readyToOffer(proposals: Proposal[], opts: ProposeOptions = {}): Proposal[] {
  const minMentions = opts.minMentions ?? 2;
  return proposals.filter((p) => p.disposition.kind === 'new' && p.mentions >= minMentions);
}

/** Proposals that need a person. Never auto-applied, never auto-dismissed. */
export function needsDecision(proposals: Proposal[]): Proposal[] {
  return proposals.filter((p) => p.disposition.kind === 'contradicts');
}
