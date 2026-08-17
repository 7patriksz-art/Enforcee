import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The findings ledger is what makes "close the day" a possible instruction.
 *
 * Patrik, 2026-08-16: *"I don't want to individually go through them... down to the last
 * finding it must individually resolve all of the findings so the next day can start
 * freshly."*
 *
 * Twelve scheduled jobs ran; nothing ran after 08:00 and no job read another's output.
 * Findings were paragraphs in twelve logs — which is exactly how sixteen contradictions
 * accumulated across nine days. A finding nobody can enumerate is a finding nobody can close.
 *
 * These tests pin the four properties that stop the ledger becoming another log:
 * ids are content-addressed, closing needs evidence, an empty ledger says so, and the
 * agent/Patrik split is real.
 */

const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'findings.mjs');
const LEDGER = join(ROOT, 'FINDINGS.jsonl');

function run(args: string[]): { out: string; code: number } {
  try {
    return { out: execFileSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' }), code: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? -1 };
  }
}

beforeEach(() => rmSync(LEDGER, { force: true }));
afterAll(() => rmSync(LEDGER, { force: true }));

describe('an empty ledger is not a clean day', () => {
  it('says so, and exits differently from "nothing open"', () => {
    // The single most repeated failure on this project is a check that silently covered
    // nothing. "0 open" from a ledger nothing ever wrote to prints identically to "0 open"
    // after a real clean day, and means the opposite.
    const empty = run(['report']);
    expect(empty.out).toMatch(/EMPTY|no run has ever written/i);
    expect(empty.code, 'an empty ledger reported as a clean day').toBe(2);

    run(['add', '--source', 'j', '--claim', 'something broke']);
    run(['close', 'x', '--commit', 'abc']); // wrong id, ignored
    const open = run(['report']);
    expect(open.code, 'an open finding did not fail the gate').toBe(1);
  });
});

describe('the same finding twice is one finding', () => {
  it('records a second sighting rather than a second item', () => {
    // Without this the ledger grows faster than anything can close it, and the count stops
    // meaning anything — which is how twelve prose logs became unreadable.
    run(['add', '--source', 'sweep', '--claim', 'binary not on PATH: shot']);
    const again = run(['add', '--source', 'sweep', '--claim', 'binary not on PATH: shot']);
    expect(again.out).toMatch(/seen again/);
    const report = run(['report']);
    expect((report.out.match(/binary not on PATH/g) ?? []).length, 'it was filed twice').toBe(1);
    expect(report.out).toMatch(/seen 2×/);
  });

  it('treats a genuinely different claim as different', () => {
    run(['add', '--source', 'sweep', '--claim', 'binary not on PATH: shot']);
    run(['add', '--source', 'sweep', '--claim', 'binary not on PATH: render.ts']);
    expect(run(['report']).out).toMatch(/render\.ts/);
  });
});

describe('closing requires evidence', () => {
  it('refuses a close with nothing behind it', () => {
    // The closer grades its own homework, so this is the cheapest available lie.
    run(['add', '--source', 'j', '--claim', 'a real problem']);
    const id = /([0-9a-f]{10})/.exec(run(['report']).out)![1];
    const bare = run(['close', id]);
    expect(bare.code, 'a finding was closed with no evidence').not.toBe(0);
    expect(bare.out).toMatch(/needs evidence/);
    expect(run(['report']).code, 'it closed anyway').toBe(1);
  });

  it('accepts a commit or a test, and then the day is clean', () => {
    run(['add', '--source', 'j', '--claim', 'a real problem']);
    const id = /([0-9a-f]{10})/.exec(run(['report']).out)![1];
    expect(run(['close', id, '--test', 'obstacles.test.ts']).code).toBe(0);
    const done = run(['report']);
    expect(done.code, 'the gate did not open after everything closed').toBe(0);
    expect(done.out).toMatch(/closed clean/);
  });

  it('refuses an escalation with no reason', () => {
    run(['add', '--source', 'j', '--claim', 'a real problem']);
    const id = /([0-9a-f]{10})/.exec(run(['report']).out)![1];
    expect(run(['escalate', id]).out).toMatch(/indistinguishable from giving up/);
  });
});

describe('what needs Patrik is separated from what does not', () => {
  it('lists them apart, so his queue is only ever the genuinely-his ones', () => {
    run(['add', '--source', 'j', '--claim', 'a parser bug', '--needs', 'agent']);
    run(['add', '--source', 'j', '--claim', 'should we raise the price', '--needs', 'patrik']);
    const out = run(['report']).out;
    const agentAt = out.indexOf('an agent can resolve');
    const patrikAt = out.indexOf('genuinely needs Patrik');
    expect(agentAt).toBeGreaterThanOrEqual(0);
    expect(patrikAt).toBeGreaterThan(agentAt);
    // The parser bug must be above the split, the pricing question below it.
    expect(out.indexOf('a parser bug')).toBeLessThan(patrikAt);
    expect(out.indexOf('should we raise the price')).toBeGreaterThan(patrikAt);
  });

  it('rejects a needs value that is neither', () => {
    expect(run(['add', '--source', 'j', '--claim', 'x', '--needs', 'someone-else']).code).not.toBe(0);
  });
});

describe('a half-written line does not take the ledger down', () => {
  it('skips it and reports the rest', () => {
    // A killed run mid-append is normal. Losing every prior finding to it is not.
    run(['add', '--source', 'j', '--claim', 'the good one']);
    writeFileSync(LEDGER, existsSync(LEDGER) ? require('node:fs').readFileSync(LEDGER, 'utf8') + '{"id":"broken' : '');
    expect(run(['report']).out).toMatch(/the good one/);
  });
});
