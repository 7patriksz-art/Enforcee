import { describe, it, expect } from 'vitest';
import { inferPreconditions, actionShaped } from '../src/lib/prevent/infer';
import { parseRuleset } from '../src/lib/rules/parse';

const rules = (md: string) => parseRuleset(md).rules;

/**
 * Inference has to be conservative. A precondition we invent and then report as unmet is a
 * false alarm, and a preflight that cries wolf gets switched off — after which it protects
 * nothing at all. Every test for a correct inference is paired with one for a mention that
 * must NOT become a requirement.
 */
describe('inferring preconditions from rules people already wrote', () => {
  it('infers a tool from a command named in a rule', () => {
    const p = inferPreconditions(rules('- Always run `npm test` before committing.'));
    expect(p.find((x) => x.kind === 'binary' && x.target === 'npm')).toBeTruthy();
  });

  it('infers a file the rule depends on', () => {
    const p = inferPreconditions(rules('- Never edit `package-lock.json` by hand.'));
    expect(p.find((x) => x.kind === 'file' && x.target === 'package-lock.json')).toBeTruthy();
  });

  it('infers an environment variable', () => {
    const p = inferPreconditions(rules('- The deploy must fail if STRIPE_WEBHOOK_SECRET is absent.'));
    expect(p.find((x) => x.kind === 'env' && x.target === 'STRIPE_WEBHOOK_SECRET')).toBeTruthy();
  });

  it('does NOT invent a requirement from a hypothetical mention', () => {
    // "for example, docker build" names a tool as illustration. Demanding docker here would
    // be a false alarm on a machine that never needed it.
    const p = inferPreconditions(rules('- Prefer a reproducible build, for example `docker build` where available.'));
    expect(p.find((x) => x.target === 'docker')).toBeFalsy();
  });

  it('does not duplicate the same precondition across many rules', () => {
    const p = inferPreconditions(rules('- Run `npm test`.\n- Also run `npm run build`.\n- And `npm run lint`.'));
    expect(p.filter((x) => x.kind === 'binary' && x.target === 'npm')).toHaveLength(1);
  });

  it('records the fragment each inference came from, so it can be argued with', () => {
    const p = inferPreconditions(rules('- Always run `npm test` before committing.'));
    const npm = p.find((x) => x.target === 'npm')!;
    expect(npm.from).toMatch(/npm test/);
    expect(npm.ruleId).toBeTruthy();
  });
});

describe('action-shaped rules — unanswerable from a text output', () => {
  it('recognises the enterprise-SOP shapes', () => {
    const found = actionShaped(rules([
      '- Escalate to the compliance officer within 24 hours.',
      '- Verify the vendor W-9 before payment is approved.',
      '- Retain the record for seven years.',
    ].join('\n')));
    expect(found).toHaveLength(3);
  });

  it('does not claim an ordinary formatting rule is action-shaped', () => {
    expect(actionShaped(rules('- Never use emojis.\n- Keep responses under 200 words.'))).toHaveLength(0);
  });
});

/**
 * The flagship regression. This layer exists because a `dig` command that was never
 * installed returned empty and was reported as "five domains probably available".
 *
 * The first version of the inferrer missed it: every tool pattern required an argument after
 * the command, and "run `dig` to confirm" has none. So the tool went unnoticed by the code
 * written to notice missing tools — the same failure, one level up. Pinned here.
 */
describe('the dig case, end to end', () => {
  it('infers a bare backticked command when a rule says to run it', () => {
    const p = inferPreconditions(rules('- Always run `dig` to confirm a domain is free before buying it.'));
    const dig = p.find((x) => x.kind === 'binary' && x.target === 'dig');
    expect(dig, 'the tool this whole layer exists for was not inferred').toBeTruthy();
    expect(dig!.from).toBe('`dig`');
  });

  it('does not treat a backticked word as a command without a run verb', () => {
    // "Never edit `config`" names a thing, not something to execute.
    const p = inferPreconditions(rules('- Never edit `config` by hand.'));
    expect(p.find((x) => x.kind === 'binary' && x.target === 'config')).toBeFalsy();
  });

  it('does not mistake a backticked filename for a command', () => {
    const p = inferPreconditions(rules('- Always run the checks defined in `vitest.config.ts`.'));
    expect(p.find((x) => x.kind === 'binary' && x.target.includes('.'))).toBeFalsy();
  });
});
