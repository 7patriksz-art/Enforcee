/**
 * THE VISIBLE TRACE — what Enforcee actually did, in the user's own project.
 *
 * Patrik, 2026-08-18: *"Enforcee must leave a visible trace, keep that subtle but convincing,
 * in the users actual ai project, where at the end of the ai work it creates a small list what
 * it has done, prevented, created, enforced, etc (very minimally so let the numbers and colors
 * speak instead of paragraphs)."*
 *
 * Everything here is COUNTED FROM THE LEDGER, never asserted. `.enforcee/ledger.jsonl` already
 * records one row per decision the guard made — DENY, WARN, ALLOW, REINJECT, CLAIM, VERIFY —
 * so a summary is arithmetic over rows that exist, not a story about a session.
 *
 * That distinction is the whole product. A trace that said "protected your project" would be
 * marketing; a trace that says "2 blocked" and can name which rule did it is evidence. If the
 * numbers are zero it says zero — a quiet session is a real result, and dressing it up would be
 * the first lie the tool told.
 */

export type LedgerRow = {
  decision?: string;
  ruleId?: string;
  rule?: string;
  tool?: string;
  verdict?: string;
  outcome?: string;
  kind?: string;
  session?: string;
  sessionId?: string;
  at?: string;
  [k: string]: unknown;
};

export interface Trace {
  /** Tool calls stopped before they ran. The number that matters most. */
  blocked: number;
  /** Tool calls flagged but allowed. */
  warned: number;
  /** Tool calls seen and permitted. The denominator. */
  allowed: number;
  /** Claims the model made that the evidence refuted. */
  refuted: number;
  /** Claims checked and confirmed. */
  confirmed: number;
  /** Claims that could not be settled either way. Never counted as good news. */
  unverifiable: number;
  /** Times the ruleset was put back into context, at session start or after a compaction. */
  reinjected: number;
  /** Tool calls the guard could not inspect — an honest gap, shown rather than hidden. */
  unchecked: number;
  /** Acceptance criteria from the run's own brief that ran and passed. */
  verified: number;
  /** Acceptance criteria that ran and did not pass. The reason work gets sent back. */
  unmet: number;
  /** Criteria that could not be settled — too slow, or the command never started. */
  unsettled: number;
  /** Distinct rules that did the blocking, in order of first appearance. */
  blockedBy: string[];
  /** True when the guard recorded nothing at all — a different thing from a clean session. */
  empty: boolean;
}

const EMPTY: Trace = {
  blocked: 0,
  warned: 0,
  allowed: 0,
  refuted: 0,
  confirmed: 0,
  unverifiable: 0,
  reinjected: 0,
  unchecked: 0,
  verified: 0,
  unmet: 0,
  unsettled: 0,
  blockedBy: [],
  empty: true,
};

/**
 * The last `maxBytes` of a ledger, starting at a line boundary.
 *
 * The status line redraws on every assistant message. A ledger is append-only and shared by
 * every session in the project, so it grows without bound - reading all of it forty times an
 * hour is a cost the user pays for our summary, which is the wrong way round.
 *
 * The first line of a tail is almost always half a row. It is dropped rather than parsed:
 * readLedger would skip it anyway, but dropping it deliberately means a truncated row can
 * never be mistaken for a real one by anything downstream.
 */
export function tailOfLedger(text: string, maxBytes = 256 * 1024): string {
  if (text.length <= maxBytes) return text;
  const cut = text.slice(text.length - maxBytes);
  const nl = cut.indexOf('\n');
  return nl === -1 ? '' : cut.slice(nl + 1);
}

/** Parse a ledger file's contents. A malformed line is skipped, never fatal. */
export function readLedger(text: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t);
      if (r && typeof r === 'object') rows.push(r as LedgerRow);
    } catch {
      /* a truncated write is not a reason to lose the whole trace */
    }
  }
  return rows;
}

/**
 * Count what happened. `session` narrows to one session id when given — without it the trace
 * covers the whole ledger, which is what `enforcee status` wants.
 */
export function summarise(rows: LedgerRow[], session?: string): Trace {
  const mine = session ? rows.filter((r) => (r.session ?? r.sessionId) === session) : rows;
  if (mine.length === 0) return { ...EMPTY, blockedBy: [] };

  const t: Trace = { ...EMPTY, blockedBy: [], empty: false };
  const seen = new Set<string>();

  for (const r of mine) {
    switch (r.decision) {
      case 'DENY': {
        t.blocked++;
        // Prefer the human-readable rule text; fall back to the id so a row is never anonymous.
        const label =
          (typeof r.rule === 'string' && r.rule.trim()) || (typeof r.ruleId === 'string' ? r.ruleId : '');
        if (label && !seen.has(label)) {
          seen.add(label);
          t.blockedBy.push(label);
        }
        break;
      }
      case 'WARN':
        t.warned++;
        break;
      case 'ALLOW':
        t.allowed++;
        break;
      case 'REINJECT':
        t.reinjected++;
        break;
      case 'UNCHECKED':
        t.unchecked++;
        break;
      case 'VERIFY':
        // The close gate's own rows. PASS and FAIL are the two real answers; SLOW and
        // UNRUNNABLE are neither, and folding them into either one would be the lie.
        if (r.outcome === 'PASS') t.verified++;
        else if (r.outcome === 'FAIL') t.unmet++;
        else t.unsettled++;
        break;
      case 'CLAIM':
        if (r.verdict === 'REFUTED') t.refuted++;
        else if (r.verdict === 'CONFIRMED') t.confirmed++;
        else t.unverifiable++;
        break;
      default:
        break; // LOADED, SESSION_MARK, CLAIM_SKIPPED — real rows, not counted as activity
    }
  }
  return t;
}

/** ANSI, or plain when the stream is not a terminal. Colour carries the meaning here. */
const ESC = '\u001b[';
const ANSI = {
  red: (s: string) => `${ESC}31m${s}${ESC}0m`,
  amber: (s: string) => `${ESC}33m${s}${ESC}0m`,
  green: (s: string) => `${ESC}32m${s}${ESC}0m`,
  grey: (s: string) => `${ESC}90m${s}${ESC}0m`,
  bold: (s: string) => `${ESC}1m${s}${ESC}0m`,
};
const PLAIN = {
  red: (s: string) => s,
  amber: (s: string) => s,
  green: (s: string) => s,
  grey: (s: string) => s,
  bold: (s: string) => s,
};

/**
 * ONE LINE. Numbers and colour, no sentences.
 *
 * Only non-zero counts appear, so a quiet session produces a short line rather than a row of
 * zeros pretending to be a report. `allowed` is always shown once anything happened, because a
 * block count with no denominator is a number without a scale.
 */
export function renderTrace(t: Trace, colour = true): string {
  const c = colour ? ANSI : PLAIN;
  if (t.empty) return c.grey('Enforcee · no decisions recorded — the guard did not run');

  const parts: string[] = [];
  if (t.blocked) parts.push(c.red(`${c.bold(String(t.blocked))} blocked`));
  if (t.refuted) parts.push(c.red(`${c.bold(String(t.refuted))} refuted`));
  if (t.unmet) parts.push(c.red(`${c.bold(String(t.unmet))} unmet`));
  if (t.warned) parts.push(c.amber(`${t.warned} warned`));
  if (t.unchecked) parts.push(c.amber(`${t.unchecked} unchecked`));
  if (t.unsettled) parts.push(c.amber(`${t.unsettled} unsettled`));
  if (t.unverifiable) parts.push(c.grey(`${t.unverifiable} unverifiable`));
  if (t.confirmed) parts.push(c.green(`${t.confirmed} confirmed`));
  if (t.verified) parts.push(c.green(`${t.verified} verified`));
  parts.push(c.grey(`${t.allowed} allowed`));
  if (t.reinjected) parts.push(c.grey(`${t.reinjected}x rules restored`));

  return `${c.bold('Enforcee')} ${c.grey('·')} ${parts.join(c.grey(' · '))}`;
}

/**
 * The persisted trace, for the project rather than the terminal.
 *
 * Deliberately tiny and deliberately markdown: it lands in a repo, so it has to survive being
 * read in a diff, and nobody wants a wall of prose in their working tree.
 */
export function renderTraceFile(t: Trace, at: string): string {
  const rows = (
    [
      ['blocked', t.blocked],
      ['refuted', t.refuted],
      ['unmet', t.unmet],
      ['warned', t.warned],
      ['unchecked', t.unchecked],
      ['unsettled', t.unsettled],
      ['unverifiable', t.unverifiable],
      ['confirmed', t.confirmed],
      ['verified', t.verified],
      ['allowed', t.allowed],
      ['rules restored', t.reinjected],
    ] as [string, number][]
  ).filter(([, n]) => n > 0);

  const lines = ['# Enforcee', '', `_${at}_`, ''];
  if (t.empty) {
    lines.push('No decisions recorded. The guard did not run in this project.');
    return lines.join('\n') + '\n';
  }
  lines.push('| | |', '|---|---:|');
  for (const [k, n] of rows) lines.push(`| ${k} | ${n} |`);
  if (t.blockedBy.length) {
    lines.push('', '**Stopped by**');
    for (const r of t.blockedBy.slice(0, 5)) lines.push(`- ${r}`);
    if (t.blockedBy.length > 5) lines.push(`- ...and ${t.blockedBy.length - 5} more`);
  }
  return lines.join('\n') + '\n';
}
