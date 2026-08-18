import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, renderTrace, renderTraceFile, summarise, type LedgerRow } from '@/lib/trace/summary';

/**
 * THE TRACE EXISTS TWICE, and this is the control that stops the two copies drifting.
 *
 * guard.mjs is standalone and dependency-free on purpose — it runs as a hook on a machine
 * that has installed nothing, so it cannot import from src/lib. That makes the trace the
 * thirteenth instance of the duplicated-source defect on this project (E-1), and it gets the
 * same treatment as the claim checks: the SAME ledger goes through both, and they must agree.
 *
 * Agreement here is string equality, not "roughly the same numbers". The trace is the one
 * thing a user reads at the end of every turn; if the hook said `2 blocked` and `enforcee
 * trace` said `3 blocked` from the same file, the whole evidence claim collapses.
 */

const GUARD = fileURLToPath(new URL('../guard/guard.mjs', import.meta.url));

function project(rows: LedgerRow[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'trace-parity-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(join(dir, '.enforcee', 'policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
  if (rows.length) {
    writeFileSync(
      join(dir, '.enforcee', 'ledger.jsonl'),
      rows.map((r) => JSON.stringify({ session: 's', ...r })).join('\n') + '\n'
    );
  }
  return dir;
}

/** Run the guard's Stop hook exactly as Claude Code would, and collect everything it left. */
function stop(dir: string) {
  const stdout = execFileSync(process.execPath, [GUARD], {
    input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: dir }),
    cwd: dir,
    encoding: 'utf8',
    // Enforcement is licensed; the trace is not, and must not become so by accident. An
    // empty licence here means this would fail if the trace ever moved below that gate.
    env: { ...process.env, ENFORCEE_LICENCE: '' },
  });
  const read = (f: string) => {
    try {
      return readFileSync(join(dir, '.enforcee', f), 'utf8');
    } catch {
      return null; // absent, or deliberately unreadable in the failure-posture case below
    }
  };
  const message: string | null = stdout.trim() ? (JSON.parse(stdout).systemMessage ?? null) : null;
  return { message, file: read('summary.md'), ledger: read('ledger.jsonl') ?? '' };
}

/** The ledger as it stands on disk right now — read after the guard has appended to it. */
function ledgerOf(dir: string): string {
  return readFileSync(join(dir, '.enforcee', 'ledger.jsonl'), 'utf8');
}

const CASES: [string, LedgerRow[]][] = [
  ['a session with every kind of row', [
    { decision: 'ALLOW' },
    { decision: 'ALLOW' },
    { decision: 'DENY', rule: 'Never force push' },
    { decision: 'DENY', rule: 'Never force push' },
    { decision: 'DENY', ruleId: 'D-abc123' },
    { decision: 'WARN', rule: 'Prefer const' },
    { decision: 'REINJECT' },
    { decision: 'UNCHECKED' },
    { decision: 'CLAIM', verdict: 'REFUTED' },
    { decision: 'CLAIM', verdict: 'CONFIRMED' },
    { decision: 'CLAIM', verdict: 'UNVERIFIABLE' },
    { decision: 'VERIFY', outcome: 'PASS' },
    { decision: 'VERIFY', outcome: 'FAIL' },
    { decision: 'VERIFY', outcome: 'SLOW' },
  ]],
  ['a quiet session that only allowed things', [{ decision: 'ALLOW' }, { decision: 'ALLOW' }, { decision: 'ALLOW' }]],
  ['blocks only, with no denominator to speak of', [{ decision: 'DENY', rule: 'Never delete a root path' }]],
  ['bookkeeping rows, which are not activity', [{ decision: 'LOADED' }, { decision: 'SESSION_MARK' }, { decision: 'CLAIM_SKIPPED' }]],
  ['more blocking rules than the file will list', [
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((rule) => ({ decision: 'DENY', rule })),
    { decision: 'ALLOW' },
  ]],
];

describe('the guard and the library never disagree about a ledger', () => {
  for (const [name, rows] of CASES) {
    it(name, () => {
      const dir = project(rows);
      const got = stop(dir);

      // Summarise from the ledger AS THE GUARD LEFT IT — the Stop run appends its own
      // SESSION_MARK row, and reading the fixture instead would compare two different files.
      const mine = summarise(readLedger(got.ledger), 's');

      if (name.startsWith('bookkeeping')) {
        expect(got.message, 'a session where nothing happened still printed a line').toBeNull();
        expect(got.file, 'a summary file was written for a session with nothing in it').toBeNull();
        return;
      }

      expect(got.message, 'the guard printed no trace at all').not.toBeNull();
      expect(got.message).toBe(renderTrace(mine, false));

      expect(got.file, 'the guard wrote no summary file').not.toBeNull();
      // The timestamp is the one thing that legitimately differs: the guard reads the clock,
      // the library takes it as an argument. Lift it out and compare everything else exactly.
      const at = /^_(.+)_$/m.exec(got.file!)?.[1];
      expect(at, 'the summary file lost its timestamp').toBeTruthy();
      expect(got.file).toBe(renderTraceFile(mine, at!));
    });
  }

  it('agrees on a half-written line rather than one of them losing the trace', () => {
    const dir = project([]);
    writeFileSync(
      join(dir, '.enforcee', 'ledger.jsonl'),
      '{"session":"s","decision":"DENY","rule":"a"}\n{"session":"s","decision":"ALL'
    );
    const got = stop(dir);
    expect(got.message).toContain('1 blocked');
    expect(got.message).toBe(renderTrace(summarise(readLedger(got.ledger), 's'), false));
  });

  it("scopes to this session in both, so another session's blocks are not claimed as ours", () => {
    const dir = project([]);
    writeFileSync(
      join(dir, '.enforcee', 'ledger.jsonl'),
      [
        JSON.stringify({ session: 'other', decision: 'DENY', rule: 'not ours' }),
        JSON.stringify({ session: 's', decision: 'ALLOW' }),
      ].join('\n') + '\n'
    );
    const got = stop(dir);
    expect(got.message, "the guard counted another session's block as this one's").not.toContain('blocked');
    expect(got.message).toBe(renderTrace(summarise(readLedger(got.ledger), 's'), false));
  });
});

describe('the trace at the end of a real session', () => {
  it('is one line, and is the last thing said', () => {
    const dir = project([{ decision: 'DENY', rule: 'Never force push' }, { decision: 'ALLOW' }]);
    const got = stop(dir);
    expect(got.message!.split('\n')).toHaveLength(1);
    expect(got.message).toContain('1 blocked');
  });

  it('survives an unwritable summary path rather than breaking the session', () => {
    // A trace that cannot be written must never take the turn down with it. The guard's whole
    // failure posture is that enforcement degrades quietly and reporting never blocks.
    const dir = project([{ decision: 'ALLOW' }]);
    mkdirSync(join(dir, '.enforcee', 'summary.md'), { recursive: true }); // a directory, not a file
    expect(stop(dir).message, 'a bad summary path took the trace down with it').toContain('1 allowed');
  });

  it('reports a session it could not read as unchecked, not as clean', () => {
    expect(stop(project([{ decision: 'UNCHECKED' }, { decision: 'ALLOW' }])).message).toContain('1 unchecked');
  });
});

describe("the CLI reproduces the hook's line from the same ledger", () => {
  /**
   * The third rendering, and the reason the trace is worth printing at all: a user who does
   * not believe the line the hook printed can run `enforcee trace` against the same file and
   * get the same answer. If those ever disagree, the summary stops being evidence.
   */
  const CLI = fileURLToPath(new URL('../cli/dist/enforcee.mjs', import.meta.url));

  it('prints the same numbers the guard just printed', () => {
    const dir = project([
      { decision: 'DENY', rule: 'Never force push' },
      { decision: 'ALLOW' },
      { decision: 'ALLOW' },
      { decision: 'CLAIM', verdict: 'REFUTED' },
      // A row from a DIFFERENT session, deliberately. Without it every assertion below holds
      // just as well for a CLI that ignores `--session` entirely, and the first version of
      // this test did exactly that: it passed with the scoping removed.
      { session: 'someone-else', decision: 'DENY', rule: 'not this session' },
    ]);
    const fromHook = stop(dir);

    const raw = execFileSync(process.execPath, [CLI, 'trace', '--json', '--session', 's'], { cwd: dir, encoding: 'utf8' });
    expect(JSON.parse(raw)).toEqual(summarise(readLedger(ledgerOf(dir)), 's'));

    const text = execFileSync(process.execPath, [CLI, 'trace', '--session', 's'], { cwd: dir, encoding: 'utf8' })
      .replace(/\x1b\[[0-9;]*m/g, '');
    expect(text, 'the CLI and the hook disagree about the same ledger').toContain(fromHook.message!);
    expect(text, "another session's block was counted as this one's").not.toContain('not this session');
    expect(text, 'the scope was dropped: two blocks reported where this session made one').toContain('1 blocked');
  });

  it('reports an absent ledger as absent, not as a clean run', () => {
    const dir = project([]);
    const text = execFileSync(process.execPath, [CLI, 'trace'], { cwd: dir, encoding: 'utf8' }).replace(/\x1b\[[0-9;]*m/g, '');
    expect(text).toMatch(/no decisions recorded/);
    expect(text, 'an uninstalled guard rendered as a quiet success').not.toMatch(/0 blocked/);
  });
});
