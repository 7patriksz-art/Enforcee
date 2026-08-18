import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE CLOSE GATE — verify for real, and if it is not green, send the work back.
 *
 * Patrik, 2026-08-18: *"it must be an active compliance layer in every action the user and
 * its ai agent takes... verifies for real if all is green, if not reinitiates the work."*
 *
 * Everything else the guard does is prevention or reporting. This is the only path that can
 * make a session carry on working, and therefore the only path that can wedge one. So the
 * assertions below are weighted heavily towards the ways it must REFUSE to block: unopted
 * projects, missing briefs, criteria nobody wrote, commands that will not start, commands too
 * slow to settle, and a session already sent back twice.
 *
 * WHAT THIS FILE PROVES AND WHAT IT DOES NOT. It drives the real guard as a subprocess and
 * checks the process-boundary contract Claude Code documents for a Stop hook: exit 2 with the
 * reason on stderr means "do not stop, here is why". It cannot prove Claude Code then behaves
 * that way, because there is no Claude Code in this sandbox. That limit is recorded in
 * FINDINGS.jsonl rather than papered over, and is why the gate ships off by default.
 */

const GUARD = fileURLToPath(new URL('../guard/guard.mjs', import.meta.url));

type Criterion = { id?: string; for?: string; run: string | null; expect?: string; why?: string };

function project(opts: { closeGate?: boolean; acceptance?: Criterion[]; brief?: boolean; budgetMs?: number; timeoutMs?: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'close-gate-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(
    join(dir, '.enforcee', 'policy.json'),
    JSON.stringify({
      deny: [],
      warn: [],
      reinject: { text: '' },
      ...(opts.closeGate === undefined ? {} : { closeGate: opts.closeGate }),
      ...(opts.budgetMs ? { closeGateBudgetMs: opts.budgetMs } : {}),
      ...(opts.timeoutMs ? { closeGateTimeoutMs: opts.timeoutMs } : {}),
    })
  );
  if (opts.brief !== false) {
    writeFileSync(
      join(dir, '.enforcee', 'brief.json'),
      JSON.stringify({
        v: 1,
        id: 'B-test',
        prompt: 'do the thing',
        createdAt: '2026-08-18T00:00:00.000Z',
        requirements: [{ id: 'R-1', text: 'the thing is done', kind: 'do', line: 1 }],
        preconditions: [],
        acceptance: (opts.acceptance ?? []).map((a, i) => ({ id: `A-${i}`, for: 'R-1', expect: '', why: 'it works', ...a })),
        blockers: [],
        rules: null,
      })
    );
  }
  return dir;
}

function stop(dir: string, event = 'Stop', session = 's1') {
  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ hook_event_name: event, session_id: session, cwd: dir }),
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ENFORCEE_LICENCE: '' },
  });
  const ledger = (() => {
    try {
      return readFileSync(join(dir, '.enforcee', 'ledger.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch {
      return [];
    }
  })();
  return {
    code: r.status,
    stderr: r.stderr ?? '',
    message: (r.stdout ?? '').trim() ? ((JSON.parse(r.stdout).systemMessage as string) ?? null) : null,
    rows: (d: string) => ledger.filter((e) => e.decision === d),
  };
}

/** Portable: `node -e` runs the same on every platform, unlike `true`, `false` or `sleep`. */
const OK = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
const BAD = `${JSON.stringify(process.execPath)} -e "console.error('two of the rows are missing'); process.exit(1)"`;
const SAYS_HI = `${JSON.stringify(process.execPath)} -e "console.log('hi there')"`;
const SLOW = `${JSON.stringify(process.execPath)} -e "setTimeout(()=>{}, 60000)"`;

describe('it refuses to block far more often than it blocks', () => {
  it('does nothing at all unless the project opted in', () => {
    // The gate can end a turn early. Off is the only safe default, and "the brief happens to
    // exist" is not consent.
    const got = stop(project({ acceptance: [{ run: BAD }] }));
    expect(got.code, 'a project that never opted in was blocked').toBe(0);
    expect(got.rows('VERIFY'), 'criteria were run without opting in').toEqual([]);
  });

  it('does nothing when there is no brief to close against', () => {
    const got = stop(project({ closeGate: true, brief: false }));
    expect(got.code).toBe(0);
    expect(got.rows('VERIFY')).toEqual([]);
  });

  it('does not block on a criterion nobody ever wrote a check for', () => {
    // PENDING is never green — `enforcee close` exits non-zero on it — but no amount of
    // further work makes a missing criterion pass, so blocking here is a loop with no exit.
    expect(
      stop(project({ closeGate: true, acceptance: [{ run: null }] })).code,
      'a session was sent back over a check that does not exist'
    ).toBe(0);
  });

  it('does not block when the command could not start', () => {
    // A spawn that never ran is not a failed check, it is an absent one. Four false
    // accusations on this project came from treating those two the same.
    const got = stop(project({ closeGate: true, acceptance: [{ run: 'definitely-not-a-real-binary-xyz --go' }] }));
    expect(got.rows('VERIFY').map((r) => r.outcome), 'a missing binary was recorded as a real failure').not.toContain('FAIL');
    expect(got.code, 'the session was sent back because a command would not start').toBe(0);
  });

  it('does not block on a command too slow to settle, and does not call it a pass either', () => {
    const got = stop(project({ closeGate: true, acceptance: [{ run: SLOW }], timeoutMs: 1200, budgetMs: 3000 }));
    const outcomes = got.rows('VERIFY').map((r) => r.outcome);
    expect(outcomes, 'an unfinished check was recorded as passing').not.toContain('PASS');
    expect(outcomes).toContain('SLOW');
    expect(got.code, 'a slow check wedged the session').toBe(0);
    expect(got.message, 'the user was not told a check could not be settled').toMatch(/could not be settled in time/);
  });

  it('never blocks on SessionEnd, which cannot be blocked', () => {
    // Claude Code documents SessionEnd as unable to prevent termination. A gate that fires
    // there would do nothing while looking like it worked.
    const got = stop(project({ closeGate: true, acceptance: [{ run: BAD }] }), 'SessionEnd');
    expect(got.code).toBe(0);
    expect(got.rows('VERIFY_BLOCK')).toEqual([]);
  });
});

describe('when a criterion the user wrote actually fails, the work goes back', () => {
  it('exits 2 and puts the reason on stderr', () => {
    const got = stop(project({ closeGate: true, acceptance: [{ run: BAD, why: 'every row is imported' }] }));
    expect(got.code, 'a failing acceptance criterion did not send the work back').toBe(2);
    expect(got.stderr, 'the reason has to name the criterion, or the agent cannot act on it').toContain('every row is imported');
    expect(got.stderr, 'the command output is the evidence and belongs in front of whoever reads this').toContain(
      'two of the rows are missing'
    );
    expect(got.stderr).toMatch(/not done yet/i);
  });

  it('records what it ran, one row per criterion, before it blocks', () => {
    const got = stop(project({ closeGate: true, acceptance: [{ run: OK }, { run: BAD }] }));
    const verify = got.rows('VERIFY');
    expect(verify).toHaveLength(2);
    expect(verify.map((r) => r.outcome).sort()).toEqual(['FAIL', 'PASS']);
    expect(got.rows('VERIFY_BLOCK'), 'the block itself left no trace').toHaveLength(1);
  });

  it('honours an expect string, so exit 0 alone is not proof', () => {
    expect(stop(project({ closeGate: true, acceptance: [{ run: SAYS_HI, expect: 'hi there' }] })).code).toBe(0);
    const red = stop(project({ closeGate: true, acceptance: [{ run: SAYS_HI, expect: 'goodbye' }] }));
    expect(red.code, 'a command that exited 0 without the expected output was accepted').toBe(2);
    expect(red.stderr).toContain('goodbye');
  });

  it('says so plainly when everything passes, and does not block', () => {
    const got = stop(project({ closeGate: true, acceptance: [{ run: OK }, { run: SAYS_HI }] }));
    expect(got.code).toBe(0);
    expect(got.message).toMatch(/2\/2 acceptance criteria proved/);
  });

  it('counts a pending criterion in the summary rather than hiding it', () => {
    const got = stop(project({ closeGate: true, acceptance: [{ run: OK }, { run: null }] }));
    expect(got.code).toBe(0);
    expect(got.message, 'a criterion with no check was quietly dropped from the report').toMatch(/no check written/);
  });
});

describe('the loop stop', () => {
  it('gives up after two attempts rather than burning a budget', () => {
    // A gate that keeps insisting costs somebody money while looking diligent. Two goes, then
    // it says what is wrong and steps aside.
    const dir = project({ closeGate: true, acceptance: [{ run: BAD, why: 'the suite is green' }] });

    expect(stop(dir).code, 'first failure did not send the work back').toBe(2);
    expect(stop(dir).code, 'second failure did not send the work back').toBe(2);

    const third = stop(dir);
    expect(third.code, 'the gate blocked a third time — that is a loop').toBe(0);
    expect(third.message, 'it gave up silently, which reads exactly like passing').toMatch(/still failing after 2 attempts/);
    expect(third.message, 'giving up must not be phrased as success').not.toMatch(/proved|pass/i);
    expect(third.rows('VERIFY_GIVE_UP')).toHaveLength(1);
  });

  it('counts attempts per session, so a new session is not punished for an old one', () => {
    const dir = project({ closeGate: true, acceptance: [{ run: BAD }] });
    stop(dir, 'Stop', 'session-a');
    stop(dir, 'Stop', 'session-a');
    expect(stop(dir, 'Stop', 'session-a').code, 'session-a should be out of attempts').toBe(0);
    expect(stop(dir, 'Stop', 'session-b').code, "session-b inherited another session's attempts").toBe(2);
  });
});
