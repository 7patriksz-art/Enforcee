import { classify, normalize, ruleId } from './rules/parse';
import type { CheckSpec } from './types';

export const PREFERENCES_VERSION = 'prefs@1.0.0';

/**
 * Preference capture.
 *
 * Most rules are never written down. They get said once, in passing — "I hate when you
 * open with a summary", "always use pnpm here", "stop apologising" — and then they decay
 * out of the conversation and are gone. This module reads what someone actually said and
 * proposes rules from it.
 *
 * Hard constraint, inherited from D-003: this is inference from natural language, so
 * nothing it produces is ever enabled silently. Every candidate carries the verbatim
 * sentence that produced it, at a real character offset, and arrives switched off.
 * The user promotes it to a rule, or it stays a suggestion forever.
 */

/**
 * `permit` is not a rule and never becomes one.
 *
 * "You can always force-push there" was read as an instruction and became the rule
 * "Always force-push there" — an obligation manufactured out of a permission, inverting
 * what the person said into something they would never have written. Permissions REMOVE
 * constraints. The right response is not a new rule; it is to notice that an existing rule
 * may no longer be wanted and say so, which is what supersede.ts does with these.
 */
export type Polarity = 'require' | 'forbid' | 'permit';
export type Strength = 'strong' | 'medium' | 'weak';

export interface PreferenceCandidate {
  /** Stable id of the rule this would become, so re-running does not duplicate. */
  id: string;
  /** The rule, rewritten as an imperative the audit engine can actually check. */
  rule: string;
  polarity: Polarity;
  strength: Strength;
  /** Which pattern fired. Shown in the UI so the inference is inspectable. */
  basis: string;
  /** The user's own words, verbatim, at a verified offset. */
  quote: string;
  start: number;
  end: number;
  /** What the audit engine would do with this rule if promoted. */
  check: CheckSpec['kind'];
  /** True when an equivalent rule is already in the ruleset. */
  alreadyCovered: boolean;
}

interface Pattern {
  re: RegExp;
  polarity: Polarity;
  strength: Strength;
  basis: string;
  /** Turn the captured object into an imperative rule. */
  rule: (object: string) => string;
}

const OBJ = "([^.!?;\\n]{3,120})";

/**
 * Ordered most-specific first. A correction ("stop doing X") is a far stronger signal
 * than a stated taste ("I prefer X"), because the user is reacting to something that
 * actually happened rather than describing themselves.
 */
const PATTERNS: Pattern[] = [
  {
    re: new RegExp(`\\b(?:stop|quit|cut it out with|no more)\\s+${OBJ}`, 'gi'),
    polarity: 'forbid',
    strength: 'strong',
    basis: 'a correction — you told it to stop mid-conversation',
    rule: (o) => frame(o, 'forbid'),
  },
  {
    re: new RegExp(`\\b(?:don't|do not|never)\\s+${OBJ}`, 'gi'),
    polarity: 'forbid',
    strength: 'strong',
    basis: 'a direct instruction',
    rule: (o) => frame(o, 'forbid'),
  },
  {
    re: new RegExp(`\\b(?:always|make sure (?:you|to)|be sure to|from now on)\\s+${OBJ}`, 'gi'),
    polarity: 'require',
    strength: 'strong',
    basis: 'a direct instruction',
    rule: (o) => frame(o, 'require'),
  },
  {
    re: new RegExp(`\\bI\\s+(?:really\\s+)?(?:hate|can't stand|cannot stand|dislike|don't like|do not like)\\s+${OBJ}`, 'gi'),
    polarity: 'forbid',
    strength: 'medium',
    basis: 'a stated dislike',
    rule: (o) => frame(o, 'forbid'),
  },
  {
    re: new RegExp(`\\bI\\s+(?:really\\s+)?(?:like|love|prefer|want|appreciate)\\s+(?:it when\\s+)?${OBJ}`, 'gi'),
    polarity: 'require',
    strength: 'medium',
    basis: 'a stated preference',
    rule: (o) => frame(o, 'require'),
  },
  {
    re: new RegExp(`\\bI\\s+(?:would|'d)\\s+(?:never|rather not|prefer not to)\\s+${OBJ}`, 'gi'),
    polarity: 'forbid',
    strength: 'medium',
    basis: 'a stated aversion',
    rule: (o) => frame(o, 'forbid'),
  },
  {
    re: new RegExp(`\\bI\\s+(?:would|'d)\\s+(?:rather|prefer to|always)\\s+${OBJ}`, 'gi'),
    polarity: 'require',
    strength: 'medium',
    basis: 'a stated preference',
    rule: (o) => frame(o, 'require'),
  },
  {
    re: new RegExp(`\\b(?:instead of|rather than)\\s+[^,]{3,60},\\s*${OBJ}`, 'gi'),
    polarity: 'require',
    strength: 'medium',
    basis: 'a substitution you asked for',
    rule: (o) => frame(o, 'require'),
  },
  {
    re: new RegExp(`\\bplease\\s+(?:don't|do not|stop)\\s+${OBJ}`, 'gi'),
    polarity: 'forbid',
    strength: 'strong',
    basis: 'a direct request',
    rule: (o) => frame(o, 'forbid'),
  },
];

/**
 * Cut a captured phrase down to the single clause the person actually meant.
 *
 * "use pnpm in this repo, never npm" is two rules, not one. Splitting here keeps each
 * proposed rule to a single checkable claim, which is the whole point — a compound rule
 * forces an all-or-nothing verdict and hides which half failed.
 */
function firstClause(raw: string): string {
  return raw.split(/,\s*(?:and\s+)?(?:but\s+)?(?:never|not|no|don't|do not|avoid)\b/i)[0];
}

/** Trim leading filler and trailing politeness. Never stems — stemming produces "opene". */
function tidy(raw: string): string {
  return firstClause(raw)
    .trim()
    .replace(/^(?:that\s+|when\s+you\s+|you\s+|to\s+|it\s+when\s+)/i, '')
    .replace(/\s+(?:please|thanks|thank you|ok|okay)\s*$/i, '')
    .replace(/[,;:]\s*$/, '')
    .trim();
}

const STOPWORDS = new Set(['this', 'that', 'these', 'those', 'them', 'thing', 'things', 'stuff', 'here', 'there', 'much', 'like']);

/** A phrase with no content word cannot become a rule anyone could check. */
function hasSubstance(s: string): boolean {
  return s
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .some((w) => w.length >= 3 && !STOPWORDS.has(w));
}

const GERUND = /^\w+ing\b/i;

/**
 * Pick a grammatical frame rather than trying to conjugate.
 * "opening every answer with a summary" only works after "Avoid", never after "Never".
 */
function frame(object: string, polarity: Polarity): string {
  const o = tidy(object);
  if (!o) return '';
  if (polarity === 'permit') return `Allowed: ${o}.`;
  if (GERUND.test(o)) return polarity === 'forbid' ? `Avoid ${o}.` : `Prefer ${o}.`;
  return polarity === 'forbid' ? `Never ${o}.` : `Always ${o}.`;
}

/**
 * Permission framing immediately before an instruction word.
 *
 * "you can always force-push there", "it's fine to skip the linter", "feel free to just
 * commit it" — each contains a word the instruction patterns match, and each is granting
 * latitude rather than issuing an order. Checked against the text just before the match so
 * the instruction patterns themselves stay simple.
 */
const PERMISSION_LEAD =
  /\b(can|could|may|are (?:free|welcome|allowed)|feel free|it'?s (?:fine|ok|okay|alright)|that'?s (?:fine|ok|okay)|fine|ok|okay|allowed|no problem|happy for you|up to you|if you (?:want|like|prefer))\b[^.!?]{0,12}$/i;

const TOO_VAGUE = /^(?:it|that|this|them|those|these|things?|stuff|anything|something)\b/i;

export interface ExtractOptions {
  /** Rule ids already present, so covered preferences are flagged rather than re-proposed. */
  existingRuleIds?: Set<string>;
  /** Discard candidates below this strength. */
  minStrength?: Strength;
}

const RANK: Record<Strength, number> = { weak: 0, medium: 1, strong: 2 };

/**
 * Read a conversation and propose rules from what the person actually said.
 * Only the user's own words are ever mined — never the assistant's.
 */
export function extractPreferences(text: string, opts: ExtractOptions = {}): PreferenceCandidate[] {
  const min = RANK[opts.minStrength ?? 'medium'];
  const existing = opts.existingRuleIds ?? new Set<string>();
  const out: PreferenceCandidate[] = [];
  const seen = new Set<string>();

  for (const p of PATTERNS) {
    if (RANK[p.strength] < min) continue;
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    let guard = 0;

    while ((m = re.exec(text)) && guard++ < 5000) {
      const object = m[1];
      if (!object) continue;
      const tidied = tidy(object);
      // Reject both "I like it" and "Never do this" — an auxiliary plus a pronoun
      // is not a rule, it is a reference to something said earlier that we cannot see.
      if (TOO_VAGUE.test(tidied)) continue;
      if (TOO_VAGUE.test(tidied.replace(/^(?:do|be|have|make|say|get|use)\s+/i, ''))) continue;
      if (!hasSubstance(tidied)) continue;

      // Latitude, not an order. Reading "you can always X" as "Always X." invents an
      // obligation out of a permission — and then, being a rule, it would be enforced.
      const lead = text.slice(Math.max(0, m.index - 40), m.index);
      const permitted = p.polarity === 'require' && PERMISSION_LEAD.test(lead);
      const polarity: Polarity = permitted ? 'permit' : p.polarity;

      const rule = permitted ? frame(object, 'permit') : p.rule(object);
      if (!rule) continue;
      const norm = normalize(rule);
      if (norm.length < 6) continue;

      const id = ruleId(norm);
      if (seen.has(id)) continue;
      seen.add(id);

      // The quote must be a real slice of the input. Same discipline as the judge.
      const start = m.index;
      const end = m.index + m[0].length;
      if (text.slice(start, end) !== m[0]) continue;

      out.push({
        id,
        rule,
        polarity,
        strength: p.strength,
        basis: permitted ? `${p.basis}, framed as permission — recorded, never turned into an obligation` : p.basis,
        quote: m[0],
        start,
        end,
        check: classify(rule).kind,
        alreadyCovered: existing.has(id),
      });
    }
  }

  return out.sort((a, b) => RANK[b.strength] - RANK[a.strength] || a.start - b.start);
}

/**
 * Pull only the human turns out of a Claude Code transcript, so the assistant's own
 * words are never mined back as if they were the user's preferences.
 *
 * ── `role: "user"` IS NOT THE SAME AS "the person typed this" ──
 *
 * Measured on this project's own 413-record transcript, 2026-08-15. It holds 150 records
 * with `type: "user"` and `message.role: "user"`. THREE of them are things Patrik typed,
 * totalling 1,344 characters. One single record is 19,412 characters — the COMPACTION
 * SUMMARY, which is the assistant's prose summarising the assistant's own work, injected
 * back into the conversation wearing the user's role.
 *
 * Filtering on role alone therefore fed 93% assistant content into a feature whose entire
 * promise is "only your words are read". It produced rules like "Never bundled into a
 * Vercel function" and "Never throws" — sentences out of my own commit messages, offered
 * back to Patrik as things HE had asked for. A tool that invents your preferences is worse
 * than one that finds none, because you cannot tell by looking.
 *
 * So the role check is necessary and nowhere near sufficient. Everything below is a channel
 * that carries non-human text under the user role:
 *
 *   isCompactSummary  the assistant's own summary, re-injected after compaction
 *   isMeta            hook output, e.g. "Stop hook feedback: ... unpushed commit(s)"
 *   <system-reminder> harness-injected context
 *   <command-name>    a slash command's expansion, and its stdout
 *   Caveat:           the harness's own preamble about command output
 *
 * A tool_result never reaches here, because only `type: "text"` blocks are read.
 */
/**
 * Structured provenance beats a text sniff. A record carries `origin.kind` when the harness
 * injected it, and that field is authoritative in a way a prefix match can never be.
 *
 * `task-notification` is the channel a SCHEDULED TASK's own prompt arrives on. Measured on
 * this repository's 08:00 LEARN run, 2026-08-18:
 *
 *     { origin: { kind: 'task-notification', subkind: 'scheduled-trigger' },
 *       entrypoint: 'remote_cowork_trigger',
 *       message: { role: 'user', content: 'You are the LEARN station — ...' } }   4,137 chars
 *
 * The text list below already named `<task-notification>`, so this channel was known and
 * meant to be excluded. It was excluded by the wrong mechanism: the real record does not
 * START with that tag, it starts with the prompt. So the filter never fired, and in a
 * scheduled container — where the only transcript on disk is the run's OWN — `enforcee learn`
 * analysed a corpus that was 100% the agent's own instructions and reported
 * "your turns only — 4137 of 71174 characters" while doing it.
 *
 * That is the 2026-08-15 defect one layer down. Then it was the assistant's prose mined as
 * the user's words; here it is the agent's ORDERS mined as the user's words, which is worse,
 * because a rule derived from an instruction is guaranteed to agree with whoever wrote the
 * instruction. Patrik's whole objection — "not me pointing at every error" — depends on this
 * corpus being his and not ours.
 */
const MACHINE_ORIGIN_KINDS = new Set(['task-notification']);

const NOT_THE_PERSON_SPEAKING = [
  '<system-reminder>',
  '<task-notification>',
  '<command-name>',
  '<command-message>',
  '<local-command-stdout>',
  'Caveat: The messages below were generated by the user while running local commands',
];

export function userTurnsFromTranscript(
  records: {
    type?: string;
    isCompactSummary?: boolean;
    isMeta?: boolean;
    origin?: { kind?: string };
    message?: { role?: string; content?: unknown };
  }[]
): string {
  const parts: string[] = [];
  for (const r of records) {
    if (r.type !== 'user' || r.message?.role !== 'user') continue;
    // The two that cost 93% of the corpus. Both are the machine talking, under the user's role.
    if (r.isCompactSummary || r.isMeta) continue;
    // The one that cost 100% of it, in every scheduled run this project makes.
    if (r.origin?.kind && MACHINE_ORIGIN_KINDS.has(r.origin.kind)) continue;
    const c = r.message.content;
    if (typeof c === 'string') parts.push(c);
    else if (Array.isArray(c)) {
      for (const b of c) {
        if (b && typeof b === 'object' && (b as { type?: string }).type === 'text') {
          const t = (b as { text?: string }).text;
          if (typeof t === 'string') parts.push(t);
        }
      }
    }
  }
  // Drop every channel that carries machine text under the user's role.
  return parts.filter((p) => !NOT_THE_PERSON_SPEAKING.some((m) => p.trimStart().startsWith(m))).join('\n\n');
}

/** Render accepted candidates as markdown ready to append to a CLAUDE.md. */
export function toRulesetMarkdown(candidates: PreferenceCandidate[], heading = 'Learned from what you said'): string {
  if (!candidates.length) return '';
  const lines = [`## ${heading}`, ''];
  for (const c of candidates) {
    lines.push(`- ${c.rule}`);
    lines.push(`  <!-- ${c.id} · ${c.basis} · "${c.quote.replace(/\s+/g, ' ').slice(0, 100)}" -->`);
  }
  return lines.join('\n') + '\n';
}
