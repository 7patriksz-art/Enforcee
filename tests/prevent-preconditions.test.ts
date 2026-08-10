import { describe, it, expect } from 'vitest';
import { checkPrecondition, preflight, verifyTool } from '../src/lib/prevent/preconditions';

/**
 * "The linter found no problems" and "the linter is not installed" are different sentences,
 * and only one of them is good news. Everything here exists to keep them apart.
 */
describe('preconditions', () => {
  it('detects a missing binary, before it can produce a false negative', () => {
    // Deliberately NOT `dig`, even though dig is the story behind this whole module.
    //
    // The first version of this test asserted dig was absent, which is true in the build
    // container and false on a GitHub runner, where dnsutils ships by default. It passed
    // locally and failed in CI, which is how release 0.3.0 got a tag with nothing behind it.
    //
    // Writing an environment assumption into a test, in the module whose entire purpose is
    // catching unstated environment assumptions, is worth leaving a note about.
    const r = checkPrecondition({ kind: 'binary', target: 'enforcee-no-such-binary-xyz', why: 'the check itself' });
    expect(r.met).toBe(false);
    expect(r.detail).toMatch(/not on PATH/);
    expect(r.evidence).toMatch(/command -v enforcee-no-such-binary-xyz/);
  });

  it('detects a present binary', () => {
    const r = checkPrecondition({ kind: 'binary', target: 'node', why: 'runs everything' });
    expect(r.met).toBe(true);
    expect(r.evidence).toMatch(/→ \//);
  });

  it('distinguishes a missing file from a file of the wrong type', () => {
    expect(checkPrecondition({ kind: 'file', target: 'package.json', why: 'x' }).met).toBe(true);
    expect(checkPrecondition({ kind: 'file', target: 'src', why: 'x' }).detail).toMatch(/not a file/);
    expect(checkPrecondition({ kind: 'dir', target: 'src', why: 'x' }).met).toBe(true);
    expect(checkPrecondition({ kind: 'file', target: 'nope.txt', why: 'x' }).detail).toMatch(/does not exist/);
  });

  it('never echoes an environment variable value', () => {
    process.env.ENFORCEE_TEST_SECRET = 'super-secret-value';
    const r = checkPrecondition({ kind: 'env', target: 'ENFORCEE_TEST_SECRET', why: 'x' });
    expect(r.met).toBe(true);
    // These are usually credentials. Length is enough to debug with; the value never is.
    expect(JSON.stringify(r)).not.toContain('super-secret-value');
    expect(r.evidence).toMatch(/18 chars/);
    delete process.env.ENFORCEE_TEST_SECRET;
  });

  it('treats an empty environment variable as unset', () => {
    process.env.ENFORCEE_TEST_EMPTY = '   ';
    expect(checkPrecondition({ kind: 'env', target: 'ENFORCEE_TEST_EMPTY', why: 'x' }).met).toBe(false);
    delete process.env.ENFORCEE_TEST_EMPTY;
  });

  it('reports a failing command as unmet rather than throwing out of the check', () => {
    const r = checkPrecondition({ kind: 'command', target: 'exit 3', why: 'x' });
    expect(r.met).toBe(false);
    expect(r.evidence).toMatch(/exit 3/);
  });

  it('a summary of an unmet preflight cannot be mistaken for a clean bill', () => {
    const report = preflight([
      { kind: 'binary', target: 'node', why: 'a' },
      { kind: 'binary', target: 'definitely-not-installed-xyz', why: 'b' },
    ]);
    expect(report.ready).toBe(false);
    expect(report.missing).toHaveLength(1);
    expect(report.summary).toMatch(/Not ready/);
    expect(report.summary).toMatch(/cannot be distinguished from real findings/);
  });
});

describe('verifyTool — on PATH is not the same as working', () => {
  it('confirms a tool that answers its control', async () => {
    const r = await verifyTool('node', 'node -e "console.log(2+2)"', '4');
    expect(r.verdict).toBe('CONFIRMED');
  });

  it('REFUTES a tool that runs but gives the wrong answer', async () => {
    // Present, executes, produces nonsense. A negative from this tool means nothing.
    const r = await verifyTool('node', 'node -e "console.log(\'banana\')"', '4');
    expect(r.verdict).toBe('REFUTED');
    expect(r.reason).toMatch(/treat its results as suspect/);
  });

  it('returns UNVERIFIABLE for a tool that is not installed at all', async () => {
    const r = await verifyTool('definitely-not-installed-xyz', 'definitely-not-installed-xyz --version', 'v');
    expect(r.verdict).toBe('UNVERIFIABLE');
  });
});
