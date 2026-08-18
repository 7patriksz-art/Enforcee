import { describe, expect, it } from 'vitest';
import { close, type Runner } from '@/lib/brief/close';
import { buildBrief } from '@/lib/brief/extract';
import type { Brief } from '@/lib/brief/types';

/**
 * STEP 6 OF THE LOOP: verify thoroughly, and if it is not green, that IS the work list.
 *
 * `close` executes the acceptance criteria the brief committed to before the work started.
 * It decides nothing — it only runs checks somebody already wrote down, which is what stops
 * "done" being something an agent asserts about itself.
 *
 * THE LOAD-BEARING RULE: a criterion nobody wrote a check for is PENDING, and pending is NOT
 * green. Counting it as success is how a plan quietly becomes a wish, and this project has six
 * recorded instances of a check that silently covered nothing. Half the assertions below exist
 * to keep that from becoming the seventh.
 */

function briefWith(acceptance: { for: string; run: string | null; expect?: string }[]): Brief {
  const b = buildBrief({ prompt: 'Run the thing.\nAlso ship it.', createdAt: '2026-08-18T00:00:00Z', rules: null });
  b.acceptance = acceptance.map((a, i) => ({
    id: `A-${i}`,
    for: a.for,
    run: a.run,
    expect: a.expect ?? '',
    why: 'test fixture',
  }));
  b.requirements = [{ id: 'R-1', text: 'ship the thing', kind: 'do', line: 1 }];
  return b;
}

const always = (ok: boolean, output = ''): Runner => () => ({ ok, output });

describe('a criterion with no check is never counted as success', () => {
  it('reports it PENDING, not PASS', () => {
    const r = close(briefWith([{ for: 'R-1', run: null }]), always(true));
    expect(r.results[0].outcome).toBe('PENDING');
    expect(r.passed).toBe(0);
  });

  it('and PENDING keeps the whole report from going green', () => {
    // The single most important assertion in this file. A brief that is entirely unchecked
    // must not be able to report success — otherwise writing no checks is the winning move.
    const r = close(briefWith([{ for: 'R-1', run: null }]), always(true));
    expect(r.green, 'a brief with no checks at all reported green').toBe(false);
  });

  it('says so in words a person can act on', () => {
    const r = close(briefWith([{ for: 'R-1', run: null }]), always(true));
    expect(r.results[0].detail).toMatch(/no check was ever written/);
    expect(r.summary).toMatch(/never had a check/);
  });
});

describe('a real check decides the outcome, and nothing else does', () => {
  it('passes when the command exits 0', () => {
    const r = close(briefWith([{ for: 'R-1', run: 'true' }]), always(true, 'fine'));
    expect(r.results[0].outcome).toBe('PASS');
    expect(r.green).toBe(true);
  });

  it('fails when the command exits non-zero, and keeps the output as evidence', () => {
    const r = close(briefWith([{ for: 'R-1', run: 'false' }]), always(false, 'boom: 3 tests failed'));
    expect(r.results[0].outcome).toBe('FAIL');
    expect(r.results[0].detail, 'the failure was reported with no evidence').toContain('3 tests failed');
    expect(r.green).toBe(false);
  });

  it('fails when it exits 0 but the output does not contain what was expected', () => {
    // "It ran" is not "it worked". A publish that exits 0 while npm still serves the old
    // version is the exact shape this catches.
    const r = close(briefWith([{ for: 'R-1', run: 'npm view enforcee version', expect: '0.9.1' }]), always(true, '0.9.0\n'));
    expect(r.results[0].outcome).toBe('FAIL');
    expect(r.results[0].detail).toMatch(/does not contain/);
  });

  it('passes when the expected string is present', () => {
    const r = close(briefWith([{ for: 'R-1', run: 'npm view enforcee version', expect: '0.9.1' }]), always(true, '0.9.1\n'));
    expect(r.results[0].outcome).toBe('PASS');
  });
});

describe('it cannot report green over nothing', () => {
  it('a brief with no acceptance rows is not green', () => {
    // An empty checklist is the oldest way to pass an audit.
    const r = close(briefWith([]), always(true));
    expect(r.green, 'a brief with zero criteria reported green').toBe(false);
    expect(r.summary).toMatch(/no acceptance criteria at all/);
  });

  it('one pending among passes still blocks green', () => {
    const r = close(briefWith([{ for: 'R-1', run: 'true' }, { for: 'R-1', run: null }]), always(true));
    expect(r.passed).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.green, 'a pending criterion was absorbed by a passing one').toBe(false);
  });
});

describe('a command that never ran is not a command that failed quietly', () => {
  it('says COULD NOT RUN rather than reporting an empty failure', () => {
    // Same rule as tests/helpers/spawn.ts. Reporting "no output" for a command the shell never
    // started is how a false accusation gets made — here, against whoever wrote the check.
    const r = close(
      briefWith([{ for: 'R-1', run: 'definitely-not-a-binary-xyz' }]),
      () => ({ ok: false, output: 'COULD NOT RUN: spawn ENOENT' })
    );
    expect(r.results[0].detail).toMatch(/COULD NOT RUN/);
  });

  it('never reports a failure with no detail at all', () => {
    const r = close(briefWith([{ for: 'R-1', run: 'x' }]), always(false, ''));
    expect(r.results[0].detail.length, 'a failure was reported with nothing to act on').toBeGreaterThan(10);
  });
});

describe('the report reads as English, not as ids', () => {
  it('carries the requirement text next to each result', () => {
    const r = close(briefWith([{ for: 'R-1', run: 'true' }]), always(true));
    expect(r.results[0].requirement).toBe('ship the thing');
  });
});
