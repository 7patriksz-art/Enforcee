/**
 * WHAT THE USER ACTUALLY SAID — the first step of the loop, and the one that was missing.
 *
 * Patrik, 2026-08-18: *"a tool that studies where it had previously made mistakes, creates
 * guards based on the user preference when he says something you should or shouldn't."*
 *
 * Enforcement and verification were both live in the hook. Learning was not: `enforcee learn`
 * only ever ran when a human typed it and pointed it at a file. So the moment that matters
 * most — somebody saying "never do that again" in the middle of a session — was recorded
 * nowhere, and by the next session it was gone. That is precisely the failure this product
 * exists to fix, and we had it ourselves.
 *
 * The split of labour here is deliberate:
 *
 *   THE GUARD CAPTURES.  A hook runs on the user's keystroke path. It does the cheapest
 *                        possible thing — decide whether a turn is even shaped like an
 *                        instruction, and if so append it verbatim. No classification, no
 *                        parsing, no judgement.
 *   THE LIBRARY DECIDES. `extractPreferences` already knows how to turn prose into
 *                        candidate rules, and it stays the only thing that does.
 *
 * That is why the guard's gate is allowed to be crude: it only has to be a SUPERSET. Anything
 * the library would eventually extract must have been captured, and tests/said.test.ts checks
 * exactly that relationship rather than demanding two implementations agree word for word.
 * Over-capture costs a line in a JSONL file; under-capture loses the sentence forever.
 */

import { createHash } from 'node:crypto';

export interface SaidRow {
  /** Content-addressed on the normalised text, so the same instruction twice is one id. */
  id: string;
  /** ISO timestamp. Injected, never read from the clock in pure code. */
  at: string;
  /** The session it was said in, so a repeat across sessions is real evidence. */
  session: string | null;
  /** The user's own words, verbatim. Never a paraphrase — the quote is the evidence. */
  text: string;
}

/**
 * The shapes an instruction takes.
 *
 * Kept deliberately coarse and boring. This is a capture gate, not a classifier: its job is
 * to be cheap enough to run on every keystroke path and generous enough that the library
 * never has to wish it had a sentence the guard threw away.
 */
const DIRECTIVE =
  /\b(never|always|dont|don't|do not|stop|make sure|must|should|from now on|no longer|instead of|prefer|avoid|remember to|be sure to)\b/i;

/** Normalised for identity: case, punctuation and whitespace are not the preference. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** `S-` + sha256 prefix of the normalised text. Same instruction, same id, every time. */
export function saidId(text: string): string {
  return 'S-' + createHash('sha256').update(normalise(text)).digest('hex').slice(0, 10);
}

/**
 * Is this turn worth keeping?
 *
 * Three ways to be uninteresting, and each was chosen from a real turn in this project's own
 * transcripts rather than from imagination:
 *
 *   too short   "yes", "go on", "ok do it" — an approval is not a preference.
 *   no shape    a question or a task description with no instruction in it.
 *   too long    a pasted log, a stack trace, a whole file. The word "never" appearing inside
 *               2 KB of pasted output is not somebody stating a preference, and capturing it
 *               fills the store with noise that makes the real ones harder to see.
 */
export function worthCapturing(text: string): boolean {
  const t = text.trim();
  if (t.length < 12 || t.length > 2000) return false;
  return DIRECTIVE.test(t);
}

/** Parse `.enforcee/said.jsonl`. A malformed line is skipped, never fatal. */
export function readSaid(raw: string): SaidRow[] {
  const rows: SaidRow[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t) as SaidRow;
      if (r && typeof r.text === 'string' && r.text.trim()) rows.push(r);
    } catch {
      /* a truncated append is not a reason to lose the rest of the file */
    }
  }
  return rows;
}

/**
 * The corpus `enforcee learn` reads when nobody hands it a file.
 *
 * Deduped by id, because saying the same thing twice in one session is emphasis, not two
 * pieces of evidence — the mention count in `learned.json` is what carries repetition, and it
 * is keyed on the occurrence so it cannot be inflated by a tool re-reading its own store.
 * That distinction was already paid for once here: `enforcee learn notes.md` run twice
 * reported "heard 2x" for something said once.
 */
export function corpusFrom(rows: SaidRow[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const id = r.id || saidId(r.text);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r.text.trim());
  }
  return out.join('\n\n');
}

/**
 * Keep the store from growing without bound.
 *
 * It sits in somebody's repository and is appended to on a keystroke path. Oldest rows go
 * first: a preference stated once eight months ago and never repeated is exactly the one
 * worth forgetting, and anything that still matters gets said again.
 */
export function trimSaid(rows: SaidRow[], max = 500): SaidRow[] {
  return rows.length <= max ? rows : rows.slice(rows.length - max);
}
