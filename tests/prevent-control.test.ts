import { describe, it, expect } from 'vitest';
import { runControlled } from '../src/lib/prevent/control';

/**
 * The regression this file exists for is a real one from this project.
 *
 * A domain check ran `dig`, which was not installed. It returned empty for five domains,
 * empty was read as "no records — probably available", and all five were reported free on
 * the strength of a command that never ran. The first test below is that exact scenario.
 */
describe('a negative needs a passing control', () => {
  it('refuses to report a negative when the instrument is missing — the dig case', async () => {
    // dig is not installed. Every query returns "". A genuine "no records" also returns "".
    const digOutput = () => '';
    const r = await runControlled({
      instrument: 'dig',
      control: () => digOutput() !== '', // google.com must resolve. It does not, because dig is absent.
      probe: () => digOutput(),
      interpret: (v) => (v === '' ? { verdict: 'REFUTED' as const, reason: 'no records — available' } : { verdict: 'CONFIRMED' as const, reason: 'registered' }),
    });
    expect(r.verdict).toBe('UNVERIFIABLE');
    expect(r.value).toBeUndefined();
    expect(r.reason).toMatch(/missing or broken produces the same empty answer/);
  });

  it('reports the negative once the instrument proves itself', async () => {
    const resolve = (host: string) => (host === 'google.com' ? '142.250.0.0' : '');
    const r = await runControlled({
      instrument: 'dig',
      control: () => resolve('google.com') !== '',
      probe: () => resolve('enforcee.example'),
      interpret: (v) => (v === '' ? { verdict: 'REFUTED' as const, reason: 'no records' } : { verdict: 'CONFIRMED' as const, reason: 'registered' }),
    });
    expect(r.verdict).toBe('REFUTED');
    expect(r.control.passed).toBe(true);
  });

  it('does not hand back a value it told you not to trust', async () => {
    const r = await runControlled({
      instrument: 'thing',
      control: () => false,
      probe: () => 'a value that must not escape',
      interpret: () => ({ verdict: 'CONFIRMED' as const, reason: '' }),
    });
    // A caller that treats UNVERIFIABLE as "fine" has reintroduced the bug. Leaving the
    // value undefined makes that mistake a type error rather than a silent wrong answer.
    expect(r.value).toBeUndefined();
  });

  it('treats a control that throws as a failed control, not a crash', async () => {
    const r = await runControlled({
      instrument: 'flaky',
      control: () => { throw new Error('ENOENT'); },
      probe: () => 'x',
      interpret: () => ({ verdict: 'CONFIRMED' as const, reason: '' }),
    });
    expect(r.verdict).toBe('UNVERIFIABLE');
    expect(r.reason).toMatch(/ENOENT/);
  });

  it('separates "the control passed but the check broke" from "the control failed"', async () => {
    const r = await runControlled({
      instrument: 'net',
      control: () => true,
      probe: () => { throw new Error('timeout'); },
      interpret: () => ({ verdict: 'CONFIRMED' as const, reason: '' }),
    });
    expect(r.verdict).toBe('UNVERIFIABLE');
    expect(r.control.passed).toBe(true);
    expect(r.reason).toMatch(/control passed but the check itself failed/);
  });

  it('confirms a positive normally', async () => {
    const r = await runControlled({
      instrument: 'fs',
      control: () => true,
      probe: () => ['a.ts', 'b.ts'],
      interpret: (v) => ({ verdict: v.length ? 'CONFIRMED' : 'REFUTED', reason: `${v.length} files` }),
    });
    expect(r.verdict).toBe('CONFIRMED');
    expect(r.value).toEqual(['a.ts', 'b.ts']);
  });
});
