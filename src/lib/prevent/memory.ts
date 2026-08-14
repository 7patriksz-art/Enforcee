import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExistingRule } from './supersede';

/**
 * Per-project memory of what has been learned, and what was decided about it.
 *
 * Semgrep's Assistant sells exactly this shape — "our platform gets smarter about your
 * specific environment with each interaction, creating a compounding advantage" — while
 * keeping data strictly per-organisation. That is the version of Patrik's "ever-learning
 * tool" that can ship today: it compounds, and it never touches another customer's code, so
 * it does not run into the promises Snyk ("does not use any customer code for engine
 * training") and Semgrep ("never commingled across tenants") have already made publicly.
 *
 * Stored as a plain file in the project, not in a service, for the same reason the guard's
 * ledger is: it is the user's own record of their own decisions, and they should be able to
 * read it, diff it, commit it or delete it without asking anyone.
 *
 * NOTHING IS EVER REMOVED FROM THIS FILE. A rule the user retired stays, marked retired,
 * with the reason and the date. That is what stops a future session re-proposing something
 * already rejected — which is the specific way an ever-learning tool becomes exhausting.
 */

export const MEMORY_VERSION = 'memory@1.0.0';

export interface MemoryEntry {
  id: string;
  rule: string;
  /** The user's own words, verbatim, when this was learned. */
  quote: string;
  /** ISO date it was first seen. */
  firstSeen: string;
  /** How many separate times this preference has been heard. */
  mentions: number;
  status: 'proposed' | 'accepted' | 'declined' | 'retired';
  /** Audited rules change a receipt; enforced rules change what gets blocked. */
  consequence: 'audited' | 'enforced';
  /** Set when superseded, naming the entry that replaced it. Never deleted. */
  supersededBy?: string;
  /** Why it was declined or retired, in the user's terms. */
  note?: string;
  /**
   * Fingerprints of the occurrences already counted, so a mention is a mention and not a
   * run. Without it, `enforcee learn notes.md` twice reported "heard 2×" and offered a rule
   * the person had said exactly once — the tool counting its own invocations as evidence
   * about the user, which is the flattery loop in miniature.
   */
  occurrences?: string[];
}

export interface Memory {
  version: string;
  entries: MemoryEntry[];
}

const FILE = 'learned.json';

/**
 * A stable key for "the same preference, however it was phrased".
 *
 * Rule ids are content-addressed on the exact text, which is right for the audit engine —
 * a reworded rule is a different rule there. It is wrong here. "Never use emojis in your
 * replies" and "never use emojis" are one preference said twice, and counting them as two
 * separate one-mention candidates defeated the entire second-mention mechanism: neither
 * ever reached the threshold, so saying something twice did nothing at all.
 *
 * Keyed on significant words plus polarity, so a rephrasing counts as a repeat and a
 * reversal does not.
 */
const STOP = new Set(['never', 'always', 'must', 'not', 'do', 'should', 'avoid', 'prefer', 'use',
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'my', 'your', 'and', 'or', 'to', 'any']);

function words(rule: string): Set<string> {
  return new Set(
    rule
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
  );
}

function negative(rule: string): boolean {
  return /\b(never|not|don't|do not|avoid|no|forbid|without|exclude|omit)\b/i.test(rule);
}

export function preferenceKey(rule: string): string {
  return `${negative(rule) ? 'no' : 'yes'}:${[...words(rule)].sort().join('.')}`;
}

/**
 * Are these the same preference, said differently?
 *
 * Overlap rather than key equality, because equality was still too strict: "never use emojis
 * in your replies" keys as `no:emoji.repli` and "never use emojis" as `no:emoji`, so a person
 * saying the same thing twice in slightly different words counted as two separate first
 * mentions and neither ever reached the threshold.
 *
 * Polarity must match, so a reversal is never absorbed as a repeat — that case belongs to
 * the supersession path, which requires a human.
 */
export function samePreference(a: string, b: string): boolean {
  if (negative(a) !== negative(b)) return false;
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

export function memoryPath(cwd = process.cwd()): string {
  return join(cwd, '.enforcee', FILE);
}

export function loadMemory(cwd = process.cwd()): Memory {
  const path = memoryPath(cwd);
  if (!existsSync(path)) return { version: MEMORY_VERSION, entries: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Memory;
    if (!Array.isArray(parsed.entries)) return { version: MEMORY_VERSION, entries: [] };
    return parsed;
  } catch {
    // A corrupt memory file must never take the tool down or, worse, be silently replaced
    // with an empty one — that would erase every decision the user has made. Read it as
    // empty for this run and leave the file alone so it can be recovered by hand.
    return { version: MEMORY_VERSION, entries: [] };
  }
}

export function saveMemory(memory: Memory, cwd = process.cwd()): void {
  const dir = join(cwd, '.enforcee');
  mkdirSync(dir, { recursive: true });
  writeFileSync(memoryPath(cwd), JSON.stringify({ ...memory, version: MEMORY_VERSION }, null, 2) + '\n');
}

/**
 * Record that a preference was heard, incrementing its count.
 *
 * Returns the entry so the caller can see how many times it now stands at — the second
 * mention is what turns a remark into a proposal.
 */
export function noteMention(
  memory: Memory,
  id: string,
  rule: string,
  quote: string,
  today: string,
  /**
   * Identifies the OCCURRENCE — which sentence, in which document, at which offset. The
   * same occurrence seen again is the same mention seen again, not a second one. Omit only
   * where no stable source exists, and accept the over-count that follows.
   */
  occurrence?: string
): MemoryEntry {
  // Matched on the preference, not the exact wording — see preferenceKey.
  const found = memory.entries.find((e) => e.id === id || samePreference(e.rule, rule));
  if (found) {
    if (occurrence) {
      const seen = (found.occurrences ??= []);
      if (seen.includes(occurrence)) return found;
      seen.push(occurrence);
    }
    found.mentions += 1;
    return found;
  }
  const entry: MemoryEntry = {
    id, rule, quote, firstSeen: today, mentions: 1, status: 'proposed', consequence: 'audited',
    ...(occurrence ? { occurrences: [occurrence] } : {}),
  };
  memory.entries.push(entry);
  return entry;
}

/**
 * Record the user's decision about a learned preference.
 *
 * Until this existed, nothing in the product ever set a status other than `proposed`, so
 * `activeRules()` returned an empty list on every call and the entire supersession layer —
 * the part that stops a passing remark quietly undoing a rule — could not fire. It was
 * tested, documented and unreachable.
 *
 * Nothing is removed here either. A declined preference stays declined so it is not
 * re-proposed, and an accepted one becomes something a future contradiction is measured
 * against.
 */
export function decide(
  memory: Memory,
  id: string,
  status: MemoryEntry['status'],
  note?: string
): MemoryEntry | null {
  const entry = memory.entries.find((e) => e.id === id || e.id.startsWith(id));
  if (!entry) return null;
  entry.status = status;
  if (note) entry.note = note;
  return entry;
}

/** Rules the audit and guard layers currently act on — what a new preference must not silently undo. */
export function activeRules(memory: Memory): ExistingRule[] {
  return memory.entries
    .filter((e) => e.status === 'accepted')
    .map((e) => ({ id: e.id, text: e.rule, consequence: e.consequence, since: e.firstSeen, quote: e.quote }));
}

/**
 * Has the user already said no to this?
 *
 * Re-proposing something already declined is how a learning tool becomes exhausting, and
 * exhausting tools get switched off. A decline is a decision and it persists.
 */
export function alreadyDeclined(memory: Memory, id: string): MemoryEntry | undefined {
  return memory.entries.find((e) => e.id === id && (e.status === 'declined' || e.status === 'retired'));
}
