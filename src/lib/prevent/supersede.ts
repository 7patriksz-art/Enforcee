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
  /**
   * About the same thing as an existing rule, but not the same size — one covers strictly
   * more ground than the other. Not a contradiction and not a duplicate; both can be true
   * at once. It gets its own disposition because folding it into `duplicate` silently threw
   * the wider preference away: "never use emoji" against an existing "never use emoji in
   * commit messages" scored a perfect containment match and was reported as already
   * covered, when in fact the user had just widened a rule and nothing happened.
   */
  | { kind: 'refines'; existing: ExistingRule; direction: 'narrower' | 'broader' }
  /** A permission that removes an existing constraint. Never applied by us. */
  | { kind: 'permits'; existing: ExistingRule; autoApplicable: false }
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
 * Subordinate clauses carry their own negation words, and reading those as the rule's
 * polarity manufactures conflicts between rules that agree.
 *
 * "Do not deploy without approval" and "Always get approval before you deploy" are the SAME
 * requirement. The first scored negative — on the "not" and again on the "without" — the
 * second scored positive, they shared "deploy" and "approval", and the tool stopped the user
 * to ask which of two identical rules they meant. A false conflict is worse than a missed
 * one: ask somebody twice to arbitrate a disagreement that is not there and they learn to
 * click through the prompt without reading it, after which the mechanism protects nothing.
 *
 * So polarity and subject are both measured on the main clause only.
 */
const SUBORDINATE = /\b(without|unless|except|other than|besides|before|after|until|while|when|whenever|if|in case of|in case)\b/i;

export function mainClause(text: string): string {
  const m = SUBORDINATE.exec(text);
  if (!m) return text;
  if (m.index > 0) return text.slice(0, m.index).trim() || text;
  // The clause leads: "Before deploying, always get approval" — the rule is after the comma.
  const comma = text.indexOf(',');
  return comma > -1 ? text.slice(comma + 1).trim() || text : text;
}

/**
 * Deliberately narrow. A missed contradiction leaves the user with two rules and a visible
 * inconsistency they can resolve themselves. A FALSE contradiction interrupts them to
 * arbitrate a conflict that does not exist.
 */
const SAME_SUBJECT = 0.6;

function contradicts(a: string, b: string): boolean {
  const ma = mainClause(a);
  const mb = mainClause(b);
  if (NEGATIVE.test(ma) === NEGATIVE.test(mb)) return false;
  const sa = subject(ma);
  const sb = subject(mb);
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

/**
 * Same subject, same polarity, same SIZE.
 *
 * Jaccard rather than the containment ratio used above, and the difference is the whole
 * point: containment says a two-word rule inside a five-word rule is a perfect match, which
 * is how "never use emoji" got reported as a duplicate of "never use emoji in commit
 * messages" and the wider rule vanished without being offered or refused.
 */
function equivalent(a: string, b: string): boolean {
  if (NEGATIVE.test(mainClause(a)) !== NEGATIVE.test(mainClause(b))) return false;
  const sa = subject(a);
  const sb = subject(b);
  if (!sa.size || !sb.size) return false;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  const union = sa.size + sb.size - shared;
  return union > 0 && shared / union >= 0.8;
}

/** Same subject and polarity, but one covers strictly more ground than the other. */
function refines(a: string, b: string): 'narrower' | 'broader' | null {
  if (NEGATIVE.test(mainClause(a)) !== NEGATIVE.test(mainClause(b))) return null;
  const sa = subject(a);
  const sb = subject(b);
  if (!sa.size || !sb.size || sa.size === sb.size) return null;
  const small = sa.size < sb.size ? sa : sb;
  const large = small === sa ? sb : sa;
  for (const w of small) if (!large.has(w)) return null;
  // `a` is the existing rule, `b` the new one.
  return sb.size > sa.size ? 'narrower' : 'broader';
}

/**
 * The rules the user has actually written down, as things a new preference can contradict.
 *
 * This is the other half of why supersession never fired: even with a decision command,
 * memory only ever holds preferences the tool itself proposed. The rules that matter most
 * are the ones already in the person's CLAUDE.md, and those were never compared against
 * anything. A rule in the compiled policy is ENFORCED — it stops tool calls — so it is
 * marked as such and gets the heavier warning.
 */
export function existingFromRuleset(rules: Rule[], enforcedIds: Set<string> = new Set()): ExistingRule[] {
  return rules.map((r) => ({
    id: r.id,
    text: r.text,
    consequence: enforcedIds.has(r.id) ? ('enforced' as const) : ('audited' as const),
  }));
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

    // A permission is a reversal wearing different clothes. "You can always force-push
    // there" removes a constraint; it never adds one, so it can never become a rule — but
    // it is exactly the second thought that must not be allowed to slide past an ENFORCED
    // rule unnoticed.
    if (candidate.polarity === 'permit') {
      const lifted = existing.find((e) => contradicts(e.text, candidate.rule) || overlap(subject(e.text), subject(candidate.rule)) >= 0.8);
      if (lifted) {
        const weight =
          lifted.consequence === 'enforced'
            ? `That rule is ENFORCED: it currently blocks tool calls in your sessions.`
            : `That rule is audited: it affects verdicts on your receipts.`;
        return {
          candidate,
          mentions,
          disposition: { kind: 'permits', existing: lifted, autoApplicable: false },
          message:
            `You said this is allowed: "${candidate.quote}". You have a rule that forbids it: "${lifted.text}". ` +
            `${weight} A permission is not a rule, so nothing was added, and nothing was removed either — ` +
            `if you meant to drop that rule, drop it yourself.`,
        };
      }
      return {
        candidate,
        mentions,
        disposition: { kind: 'new' },
        message: 'A permission, not a rule. Recorded; nothing added, because permissions remove constraints rather than creating them.',
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

    const wider = existing
      .map((e) => ({ e, dir: refines(e.text, candidate.rule) }))
      .find((x): x is { e: ExistingRule; dir: 'narrower' | 'broader' } => x.dir !== null);
    if (wider) {
      return {
        candidate,
        mentions,
        disposition: { kind: 'refines', existing: wider.e, direction: wider.dir },
        message:
          wider.dir === 'narrower'
            ? `A narrower version of a rule you already have: "${wider.e.text}". Both can be true at once, so nothing was changed — keep the general one, or replace it with this.`
            : `A wider version of a rule you already have: "${wider.e.text}". You have just asked for more than that rule covers, and it was NOT quietly extended — say which you meant.`,
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
  // An `action` rule asks whether something HAPPENED. Nothing in the audit engine can read
  // that off a text output, which is precisely why the kind exists — so calling it
  // "checkable by code" here was the false reassurance this function was written to
  // prevent, printed by the function that prevents it.
  if (candidate.check === 'action') {
    return {
      ok: false,
      why: 'this asks whether an action happened, which no reading of an answer can settle — `enforcee verify` checks it against the environment instead',
    };
  }
  return { ok: true, why: `checkable by code (${candidate.check})` };
}

/**
 * Proposals safe to offer without arbitration: new, heard enough times, and actually a rule.
 *
 * A permission is excluded however many times it is said. Repetition is evidence that
 * somebody means it; it is not evidence about what should replace the rule they already
 * have, and only they know that.
 */
export function readyToOffer(proposals: Proposal[], opts: ProposeOptions = {}): Proposal[] {
  const minMentions = opts.minMentions ?? 2;
  return proposals.filter(
    (p) => p.disposition.kind === 'new' && p.mentions >= minMentions && p.candidate.polarity !== 'permit'
  );
}

/** Proposals that need a person. Never auto-applied, never auto-dismissed. */
export function needsDecision(proposals: Proposal[]): Proposal[] {
  return proposals.filter((p) => p.disposition.kind === 'contradicts' || p.disposition.kind === 'permits');
}

/**
 * Proposals worth showing but not blocking on: a rule that widens or narrows one already
 * there. Reported rather than resolved, for the same reason as everything else here.
 */
export function needsReview(proposals: Proposal[]): Proposal[] {
  return proposals.filter((p) => p.disposition.kind === 'refines');
}
