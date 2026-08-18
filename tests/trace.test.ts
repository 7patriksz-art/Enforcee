import { describe, expect, it } from 'vitest';
import { readLedger, renderTrace, renderTraceFile, summarise, type LedgerRow } from '@/lib/trace/summary';

/**
 * THE VISIBLE TRACE, and the reason it is arithmetic rather than prose.
 *
 * Patrik, 2026-08-18: *"Enforcee must leave a visible trace... very minimally so let the
 * numbers and colors speak instead of paragraphs."*
 *
 * Every number here is COUNTED FROM `.enforcee/ledger.jsonl`, which the guard writes one row
 * at a time as it makes each decision. Nothing is asserted about a session; the trace can only
 * say what rows exist.
 *
 * That is the whole difference between this and marketing. "Protected your project" is a
 * claim. "3 blocked, and here are the two rules that did it" is evidence, and a reader can go
 * to the ledger and check it. Half the assertions below exist to stop the first kind creeping
 * back in — particularly the ones about zero and about a guard that never ran.
 */

const line = (r: LedgerRow) => JSON.stringify(r);
const ledger = (...rows: LedgerRow[]) => readLedger(rows.map(line).join('\n'));

describe('the trace counts rows and never invents them', () => {
  it('counts each kind of decision separately', () => {
    const t = summarise(
      ledger(
        { decision: 'ALLOW' },
        { decision: 'ALLOW' },
        { decision: 'DENY', rule: 'Never force push' },
        { decision: 'WARN', rule: 'Prefer const' },
        { decision: 'REINJECT' },
        { decision: 'UNCHECKED' }
      )
    );
    expect(t.allowed).toBe(2);
    expect(t.blocked).toBe(1);
    expect(t.warned).toBe(1);
    expect(t.reinjected).toBe(1);
    expect(t.unchecked).toBe(1);
  });

  it('splits claim verdicts three ways, and never folds unverifiable into good news', () => {
    // The honest bucket has to stay its own number. A tool that reported "1 confirmed" for a
    // claim it could not settle would be doing the exact thing it exists to catch.
    const t = summarise(
      ledger(
        { decision: 'CLAIM', verdict: 'REFUTED' },
        { decision: 'CLAIM', verdict: 'CONFIRMED' },
        { decision: 'CLAIM', verdict: 'UNVERIFIABLE' }
      )
    );
    expect(t.refuted).toBe(1);
    expect(t.confirmed).toBe(1);
    expect(t.unverifiable).toBe(1);
  });

  it('splits the close gate three ways, and an unsettled check is never a pass', () => {
    // A criterion that timed out or whose command never started settled nothing; counting
    // either as verified would make the one number a reader most wants to trust the least
    // trustworthy on the line.
    const t = summarise(
      ledger(
        { decision: 'VERIFY', outcome: 'PASS' },
        { decision: 'VERIFY', outcome: 'PASS' },
        { decision: 'VERIFY', outcome: 'FAIL' },
        { decision: 'VERIFY', outcome: 'SLOW' },
        { decision: 'VERIFY', outcome: 'UNRUNNABLE' }
      )
    );
    expect(t.verified).toBe(2);
    expect(t.unmet).toBe(1);
    expect(t.unsettled, 'a slow check and a missing binary are both unsettled, not failures').toBe(2);
  });

  it('shows an unmet criterion in red beside what was blocked', () => {
    const t = summarise(ledger({ decision: 'VERIFY', outcome: 'FAIL' }, { decision: 'VERIFY', outcome: 'PASS' }));
    const plain = renderTrace(t, false);
    expect(plain).toContain('1 unmet');
    expect(plain).toContain('1 verified');
    expect(renderTrace(t, true), 'unmet work is not red').toMatch(/\x1b\[31m/);
  });

  it('names the rules that did the blocking, deduped, in order', () => {
    const t = summarise(
      ledger(
        { decision: 'DENY', rule: 'Never force push' },
        { decision: 'DENY', rule: 'Never force push' },
        { decision: 'DENY', rule: 'Never delete a root path' }
      )
    );
    expect(t.blocked, 'a repeat block is still a block').toBe(3);
    expect(t.blockedBy, 'the same rule was listed twice').toEqual(['Never force push', 'Never delete a root path']);
  });

  it('falls back to the rule id so a block is never anonymous', () => {
    expect(summarise(ledger({ decision: 'DENY', ruleId: 'D-abc123' })).blockedBy).toEqual(['D-abc123']);
  });

  it('ignores bookkeeping rows, which are not activity', () => {
    // LOADED and SESSION_MARK are real ledger rows but nothing happened to the user because
    // of them. Counting them would inflate every number in the direction that flatters us.
    const t = summarise(ledger({ decision: 'LOADED' }, { decision: 'SESSION_MARK' }, { decision: 'CLAIM_SKIPPED' }));
    expect(t.blocked + t.warned + t.allowed + t.confirmed + t.refuted).toBe(0);
    expect(t.empty, 'rows existed, so this is not an empty ledger').toBe(false);
  });

  it('scopes to one session when asked', () => {
    const rows = ledger(
      { decision: 'DENY', session: 's1', rule: 'a' },
      { decision: 'DENY', session: 's2', rule: 'b' },
      { decision: 'ALLOW', sessionId: 's1' }
    );
    expect(summarise(rows, 's1').blocked).toBe(1);
    expect(summarise(rows, 's1').allowed, 'sessionId is the same field under another name').toBe(1);
    expect(summarise(rows, 's2').blocked).toBe(1);
    expect(summarise(rows).blocked, 'unscoped should see everything').toBe(2);
  });

  it('survives a truncated line rather than losing the whole trace', () => {
    // A ledger is appended to during a live session, so a half-written last line is normal.
    const rows = readLedger('{"decision":"DENY","rule":"a"}\n{"decision":"ALL');
    expect(rows).toHaveLength(1);
    expect(summarise(rows).blocked).toBe(1);
  });
});

describe('a quiet session and an absent guard are different results', () => {
  it('says so plainly when nothing was recorded at all', () => {
    const t = summarise([]);
    expect(t.empty).toBe(true);
    expect(renderTrace(t, false)).toMatch(/no decisions recorded/);
    expect(renderTrace(t, false), 'an absent guard must not read as a clean run').not.toMatch(/0 blocked/);
  });

  it('reports a real but quiet session as itself, with no padding', () => {
    const t = summarise(ledger({ decision: 'ALLOW' }));
    expect(t.empty).toBe(false);
    const out = renderTrace(t, false);
    expect(out).toContain('1 allowed');
    expect(out, 'zeros were printed to fill the line out').not.toMatch(/0 blocked|0 warned|0 refuted/);
  });

  it('never claims protection it cannot evidence', () => {
    // The line the product must not cross. If this ever needs relaxing, that is a decision
    // for Patrik, not a convenience for a nicer-looking summary.
    const busy = renderTrace(summarise(ledger({ decision: 'DENY', rule: 'r' }, { decision: 'ALLOW' })), false);
    for (const marketing of [/protect/i, /safe/i, /secure/i, /success/i, /great/i, /all good/i]) {
      expect(busy, `the trace editorialises: ${marketing}`).not.toMatch(marketing);
    }
  });
});

describe('it is one line, and colour carries the meaning', () => {
  const t = summarise(
    ledger(
      { decision: 'DENY', rule: 'Never force push' },
      { decision: 'CLAIM', verdict: 'REFUTED' },
      { decision: 'WARN' },
      { decision: 'ALLOW' },
      { decision: 'REINJECT' }
    )
  );

  it('renders on a single line', () => {
    expect(renderTrace(t, false).split('\n')).toHaveLength(1);
  });

  it('always shows the denominator, so a count has a scale', () => {
    expect(renderTrace(t, false), 'blocked with no allowed is a number without a scale').toContain('allowed');
  });

  it('uses red for what was stopped and refuted, amber for warnings', () => {
    const c = renderTrace(t, true);
    expect(c, 'blocked is not red').toMatch(/\x1b\[31m[^\x1b]*\x1b\[1m1\x1b\[0m blocked/);
    expect(c, 'warned is not amber').toMatch(/\x1b\[33m1 warned/);
  });

  it('emits no escape codes when colour is off, for logs and CI', () => {
    expect(renderTrace(t, false)).not.toMatch(/\x1b\[/);
  });
});

describe('the file that lands in the project', () => {
  const t = summarise(
    ledger({ decision: 'DENY', rule: 'Never force push' }, { decision: 'ALLOW' }, { decision: 'ALLOW' })
  );
  const md = renderTraceFile(t, '2026-08-18 09:20 UTC');

  it('is small enough that nobody minds it in a diff', () => {
    expect(md.split('\n').length, 'the trace file grew into a report').toBeLessThan(22);
  });

  it('omits every zero row rather than listing them', () => {
    expect(md).toContain('| blocked | 1 |');
    expect(md, 'a zero row was printed').not.toMatch(/\| (warned|refuted|confirmed|verified) \| 0 \|/);
  });

  it('names what stopped things, because a count alone is not checkable', () => {
    expect(md).toContain('Never force push');
  });

  it('says nothing happened when nothing did', () => {
    expect(renderTraceFile(summarise([]), 'now')).toMatch(/No decisions recorded/);
  });

  it('takes its timestamp as an argument rather than reading the clock', () => {
    expect(md).toContain('2026-08-18 09:20 UTC');
  });
});
