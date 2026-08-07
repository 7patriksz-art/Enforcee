import { describe, expect, it } from 'vitest';
import { classify, parseRuleset, ruleId, normalize, splitRules } from '@/lib/rules/parse';
import { runDeterministic, guessLanguage, wordCount } from '@/lib/checks/deterministic';
import { locateQuote, runJudge } from '@/lib/checks/judge';
import { runHealth } from '@/lib/checks/health';
import { canonicalize, hashText, sealReceipt, verifyReceipt } from '@/lib/receipt';
import { priceOf, rateFor } from '@/lib/cost';
import { runAudit } from '@/lib/audit';
import type { Rule } from '@/lib/types';

const RULESET = `# House rules

## Style
- Never use emojis.
- Never use em-dashes.
- Always respond in English.
- Keep every answer under 120 words.
- Always include the phrase "Signed-off" at the end.

## Format
- Respond in valid JSON.
- Use a markdown table when comparing options.
- Code blocks must be tagged python.

## Sourcing
- Always cite sources with links.
- Be helpful.
`;

function ruleFor(text: string): Rule {
  return {
    id: ruleId(normalize(text)),
    text,
    normalized: normalize(text),
    source: { startLine: 1, endLine: 1, section: [], artifact: 'test' },
    check: classify(text),
    trigger: null,
    position: 0,
    tokens: 10,
  };
}

describe('rule parsing', () => {
  it('splits markdown bullets into atomic rules under their section', () => {
    const raw = splitRules(RULESET);
    expect(raw.length).toBe(10);
    expect(raw[0].section).toEqual(['House rules', 'Style']);
    expect(raw[0].text).toBe('Never use emojis.');
  });

  it('gives the same rule the same id regardless of formatting noise', () => {
    expect(ruleId(normalize('- **Never** use emojis.'))).toBe(ruleId(normalize('never use emojis')));
  });

  it('ignores fenced code blocks', () => {
    const raw = splitRules('- real rule here always\n\n```\n- fake rule inside a fence always\n```\n');
    expect(raw).toHaveLength(1);
  });

  it('assigns a position so buried rules can be flagged', () => {
    const { rules } = parseRuleset(RULESET);
    expect(rules[0].position).toBeLessThan(0.2);
    expect(rules[rules.length - 1].position).toBeGreaterThan(0.7);
  });
});

describe('classification', () => {
  const cases: [string, string][] = [
    ['Never use emojis.', 'no_emoji'],
    ['Never use em-dashes.', 'no_em_dash'],
    ['Always respond in English.', 'language'],
    ['Keep every answer under 120 words.', 'max_words'],
    ['Always include the phrase "Signed-off" at the end.', 'required_literal'],
    ['Respond in valid JSON.', 'format_json'],
    ['Use a markdown table when comparing options.', 'format_markdown_table'],
    ['Code blocks must be tagged python.', 'code_fence_language'],
    ['Always cite sources with links.', 'citation_required'],
    ['Be helpful.', 'judged'],
    ['Never use the word delve.', 'forbidden_literal'],
    ['Output must match /^SUMMARY:/ exactly.', 'required_regex'],
  ];

  for (const [text, kind] of cases) {
    it(`classifies ${JSON.stringify(text)} as ${kind}`, () => {
      expect(classify(text).kind).toBe(kind);
    });
  }

  it('routes vague rules to the judge with a stated reason', () => {
    const c = classify('Be helpful.');
    expect(c.kind).toBe('judged');
    if (c.kind === 'judged') expect(c.reason).toMatch(/vague/i);
  });
});

describe('deterministic layer', () => {
  it('catches an emoji violation with a real offset', () => {
    const out = 'Hello there 🎉 all good.';
    const r = runDeterministic(ruleFor('Never use emojis.'), out)!;
    expect(r.verdict).toBe('VIOLATED');
    expect(out.slice(r.evidence[0].start, r.evidence[0].end)).toBe(r.evidence[0].quote);
  });

  it('does not claim engagement when a forbidden thing merely fails to appear', () => {
    const r = runDeterministic(ruleFor('Never use the word delve.'), 'A plain answer.')!;
    expect(r.verdict).toBe('FOLLOWED');
    expect(r.engaged).toBe(false);
  });

  it('treats a missing em-dash as real engagement evidence', () => {
    const r = runDeterministic(ruleFor('Never use em-dashes.'), 'A plain answer with no long dashes.')!;
    expect(r.verdict).toBe('FOLLOWED');
    expect(r.engaged).toBe(true);
  });

  it('enforces word limits', () => {
    const long = Array.from({ length: 130 }, (_, i) => `w${i}`).join(' ');
    expect(runDeterministic(ruleFor('Keep every answer under 120 words.'), long)!.verdict).toBe('VIOLATED');
    expect(runDeterministic(ruleFor('Keep every answer under 120 words.'), 'short')!.verdict).toBe('FOLLOWED');
    expect(wordCount(long)).toBe(130);
  });

  it('validates JSON output including fenced JSON', () => {
    expect(runDeterministic(ruleFor('Respond in valid JSON.'), '```json\n{"a":1}\n```')!.verdict).toBe('FOLLOWED');
    expect(runDeterministic(ruleFor('Respond in valid JSON.'), 'not json at all')!.verdict).toBe('VIOLATED');
  });

  it('finds markdown tables', () => {
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |';
    expect(runDeterministic(ruleFor('Use a markdown table when comparing options.'), table)!.verdict).toBe('FOLLOWED');
    expect(runDeterministic(ruleFor('Use a markdown table when comparing options.'), 'no table')!.verdict).toBe('VIOLATED');
  });

  it('marks a code-fence rule NOT_APPLICABLE when there is no code', () => {
    const r = runDeterministic(ruleFor('Code blocks must be tagged python.'), 'Prose only.')!;
    expect(r.verdict).toBe('NOT_APPLICABLE');
  });

  it('flags a mistagged code fence', () => {
    const r = runDeterministic(ruleFor('Code blocks must be tagged python.'), '```js\nlet a=1\n```')!;
    expect(r.verdict).toBe('VIOLATED');
  });

  it('detects citations', () => {
    expect(runDeterministic(ruleFor('Always cite sources with links.'), 'See [docs](https://x.dev/a).')!.verdict).toBe('FOLLOWED');
    expect(runDeterministic(ruleFor('Always cite sources with links.'), 'Trust me.')!.verdict).toBe('VIOLATED');
  });

  it('admits when language detection is not confident', () => {
    const r = runDeterministic(ruleFor('Always respond in English.'), 'ok')!;
    expect(r.verdict).toBe('UNVERIFIABLE');
  });

  it('detects a clear language mismatch', () => {
    const hu = 'Ez egy magyar mondat és nem angol, hogy nem is kell azt a többi szöveget.';
    const r = runDeterministic(ruleFor('Always respond in English.'), hu)!;
    expect(r.verdict).toBe('VIOLATED');
    expect(guessLanguage(hu)).toBe('hu');
  });

  it('returns null for rules it cannot prove, so they reach the judge', () => {
    expect(runDeterministic(ruleFor('Be helpful.'), 'anything')).toBeNull();
  });
});

describe('judge evidence gate', () => {
  const rules = [ruleFor('Adopt a warm and encouraging tone.')];

  it('locates a quote even when whitespace differs', () => {
    const out = 'Great question!\n\nHere   is the answer.';
    const span = locateQuote(out, 'Here is the answer.');
    expect(span).not.toBeNull();
    expect(out.slice(span!.start, span!.end)).toBe(span!.quote);
  });

  it('downgrades a verdict whose evidence is not in the output', async () => {
    const fake = async () => ({
      text: JSON.stringify({
        results: [{ rule_id: rules[0].id, verdict: 'FOLLOWED', evidence_quote: 'text that was never written', rationale: 'looks warm' }],
      }),
      inputTokens: 100,
      outputTokens: 50,
    });
    const { results } = await runJudge(rules, 'A cold, terse reply.', { transport: fake, samples: 1 });
    expect(results[0].verdict).toBe('UNVERIFIABLE');
    expect(results[0].downgraded).toBe(true);
    expect(results[0].engaged).toBe(false);
  });

  it('accepts a verdict whose evidence is literally present', async () => {
    const output = 'Great question! You are on exactly the right track here.';
    const fake = async () => ({
      text: JSON.stringify({
        results: [{ rule_id: rules[0].id, verdict: 'FOLLOWED', evidence_quote: 'You are on exactly the right track', rationale: 'encouraging' }],
      }),
      inputTokens: 100,
      outputTokens: 50,
    });
    const { results } = await runJudge(rules, output, { transport: fake, samples: 1 });
    expect(results[0].verdict).toBe('FOLLOWED');
    expect(output.slice(results[0].evidence[0].start, results[0].evidence[0].end)).toBe(results[0].evidence[0].quote);
  });

  it('reports disagreement across samples', async () => {
    const output = 'Great question! You are on exactly the right track here.';
    let n = 0;
    const fake = async () => {
      n++;
      const verdict = n === 1 ? 'VIOLATED' : 'FOLLOWED';
      return {
        text: JSON.stringify({
          results: [{ rule_id: rules[0].id, verdict, evidence_quote: 'You are on exactly the right track', rationale: 'r' }],
        }),
        inputTokens: 10,
        outputTokens: 10,
      };
    };
    const { results } = await runJudge(rules, output, { transport: fake, samples: 3 });
    expect(results[0].verdict).toBe('FOLLOWED');
    expect(results[0].agreement).toBeCloseTo(2 / 3, 5);
  });

  it('survives malformed judge output', async () => {
    const fake = async () => ({ text: 'I refuse to answer in JSON.', inputTokens: 5, outputTokens: 5 });
    const { results } = await runJudge(rules, 'x', { transport: fake, samples: 2 });
    expect(results[0].verdict).toBe('UNVERIFIABLE');
    expect(results[0].agreement).toBe(0);
  });

  it('meters every sample', async () => {
    const fake = async () => ({ text: '{"results":[]}', inputTokens: 1000, outputTokens: 200 });
    const { cost } = await runJudge(rules, 'x', { transport: fake, samples: 3, model: 'claude-sonnet-4-5' });
    expect(cost).toHaveLength(3);
    expect(cost[0].usd).toBeCloseTo(1000e-6 * 3 + 200e-6 * 15, 8);
  });
});

describe('ruleset health', () => {
  it('flags an exact duplicate', () => {
    const text = '- Always cite sources.\n- Always cite sources.\n';
    const { rules, totalTokens } = parseRuleset(text);
    const findings = runHealth(rules, text, totalTokens);
    expect(findings.some((f) => f.code === 'duplicate')).toBe(true);
  });

  it('flags a contradiction', () => {
    const text = '- Always use emojis in replies.\n- Never use emojis in replies.\n';
    const { rules, totalTokens } = parseRuleset(text);
    const findings = runHealth(rules, text, totalTokens);
    expect(findings.some((f) => f.code === 'contradiction')).toBe(true);
  });

  it('flags unenforceable rules', () => {
    const text = '- Be helpful.\n- Use good judgment.\n';
    const { rules, totalTokens } = parseRuleset(text);
    expect(runHealth(rules, text, totalTokens).filter((f) => f.code === 'unenforceable')).toHaveLength(2);
  });

  it('flags an oversized ruleset', () => {
    const text = '- Always be precise.\n';
    const { rules } = parseRuleset(text);
    expect(runHealth(rules, text, 9000).some((f) => f.code === 'oversized')).toBe(true);
  });
});

describe('receipt integrity', () => {
  it('canonicalizes key order', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('ignores trailing whitespace when hashing text', () => {
    expect(hashText('a  \nb')).toBe(hashText('a\nb'));
  });

  it('detects tampering', async () => {
    const { receipt } = await runAudit({ ruleset: RULESET, output: 'Hello.', deterministicOnly: true });
    expect(verifyReceipt(receipt).valid).toBe(true);
    const tampered = { ...receipt, summary: { ...receipt.summary, violated: 0 } };
    expect(verifyReceipt(tampered).valid).toBe(false);
  });

  it('produces the same digest for the same inputs', () => {
    const body = { version: '1' as const, a: 1 } as never;
    expect(sealReceipt(body).digest).toBe(sealReceipt(body).digest);
  });
});

describe('cost metering', () => {
  it('prices known models exactly', () => {
    expect(rateFor('claude-sonnet-4-5-20250929').exact).toBe(true);
    expect(priceOf('claude-sonnet-4-5', 1_000_000, 0)).toBeCloseTo(3, 6);
  });

  it('never treats an unknown model as free', () => {
    expect(priceOf('some-future-model', 1_000_000, 1_000_000)).toBeGreaterThan(0);
    expect(rateFor('some-future-model').exact).toBe(false);
  });
});

describe('full audit', () => {
  it('runs deterministic-only with no model call and reports coverage', async () => {
    const output = 'Signed-off';
    const { receipt, totalUsd } = await runAudit({ ruleset: RULESET, output, deterministicOnly: true });
    expect(totalUsd).toBe(0);
    expect(receipt.cost).toHaveLength(0);
    expect(receipt.engine.judge).toBeNull();
    expect(receipt.results).toHaveLength(receipt.rules.length);
    expect(receipt.summary.coverage).toBeGreaterThan(0);
    expect(receipt.summary.coverage).toBeLessThanOrEqual(1);
  });

  it('keeps results in ruleset order', async () => {
    const { receipt } = await runAudit({ ruleset: RULESET, output: 'x', deterministicOnly: true });
    expect(receipt.results.map((r) => r.ruleId)).toEqual(receipt.rules.map((r) => r.id));
  });

  it('every evidence span really points at the quoted text', async () => {
    const output = '# Report\n\nSee [source](https://a.dev). Signed-off';
    const { receipt } = await runAudit({ ruleset: RULESET, output, deterministicOnly: true });
    for (const r of receipt.results) {
      for (const e of r.evidence) {
        expect(output.slice(e.start, e.end)).toBe(e.quote);
      }
    }
  });

  it('chains to a previous receipt', async () => {
    const a = await runAudit({ ruleset: RULESET, output: 'one', deterministicOnly: true });
    const b = await runAudit({ ruleset: RULESET, output: 'two', deterministicOnly: true, previousDigest: a.receipt.digest });
    expect(b.receipt.previousDigest).toBe(a.receipt.digest);
    expect(verifyReceipt(b.receipt).valid).toBe(true);
  });
});

describe('code fence counting', () => {
  it('counts only opening fences, not the closing pair', async () => {
    const out = '```js\nlet a=1\n```\n\ntext\n\n```python\nb=2\n```';
    const r = runDeterministic(ruleFor('Code blocks must be tagged python.'), out)!;
    expect(r.verdict).toBe('VIOLATED');
    expect(r.rationale).toBe('1 of 2 code block(s) not tagged "python".');
    for (const e of r.evidence) expect(out.slice(e.start, e.end)).toBe(e.quote);
  });

  it('passes when every opening fence is tagged correctly', () => {
    const out = '```python\na=1\n```\n\n```python\nb=2\n```';
    const r = runDeterministic(ruleFor('Code blocks must be tagged python.'), out)!;
    expect(r.verdict).toBe('FOLLOWED');
  });

  it('handles indented fences', () => {
    const out = '  ```python\n  a=1\n  ```';
    const r = runDeterministic(ruleFor('Code blocks must be tagged python.'), out)!;
    expect(r.verdict).toBe('FOLLOWED');
    for (const e of r.evidence) expect(out.slice(e.start, e.end)).toBe(e.quote);
  });
});

describe('contradiction detection', () => {
  const health = (text: string) => {
    const { rules, totalTokens } = parseRuleset(text);
    return runHealth(rules, text, totalTokens);
  };

  it('catches opposite polarity on the same topic even when wording differs', () => {
    const f = health('- Always use emojis to keep things friendly.\n- Never use emojis.\n');
    const c = f.find((x) => x.code === 'contradiction');
    expect(c).toBeDefined();
    expect(c!.message).toContain('emojis');
  });

  it('does not fire on unrelated rules that share a generic verb', () => {
    const f = health('- Always use a markdown table.\n- Never use emojis.\n');
    expect(f.some((x) => x.code === 'contradiction')).toBe(false);
  });

  it('does not fire on two rules that agree', () => {
    const f = health('- Always cite sources.\n- Always include links to sources.\n');
    expect(f.some((x) => x.code === 'contradiction')).toBe(false);
  });

  it('still reports exact duplicates separately', () => {
    const f = health('- Keep every answer under 100 words.\n- Keep every answer under 100 words.\n');
    expect(f.some((x) => x.code === 'duplicate')).toBe(true);
  });
});
