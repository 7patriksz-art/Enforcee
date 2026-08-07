import { parseRuleset, isUnenforceable, PARSER_VERSION } from './rules/parse';
import { runDeterministic, DETERMINISTIC_VERSION } from './checks/deterministic';
import { runJudge, JUDGE_VERSION, type JudgeOptions } from './checks/judge';
import { runHealth } from './checks/health';
import { hashText, sealReceipt } from './receipt';
import { totalUsd } from './cost';
import type { CostEntry, Receipt, Rule, RuleResult } from './types';

export interface AuditInput {
  ruleset: string;
  output: string;
  artifact?: string;
  previousDigest?: string | null;
  /** Skip Layer B entirely — free, instant, deterministic-only audit. */
  deterministicOnly?: boolean;
  judge?: JudgeOptions;
}

export interface AuditOutcome {
  receipt: Receipt;
  totalUsd: number;
}

function summarize(rules: Rule[], results: RuleResult[]): Receipt['summary'] {
  const by = (v: RuleResult['verdict']) => results.filter((r) => r.verdict === v).length;
  const notApplicable = by('NOT_APPLICABLE');
  const applicable = Math.max(0, results.length - notApplicable);
  const engaged = results.filter((r) => r.engaged && r.verdict !== 'NOT_APPLICABLE').length;
  const deterministic = results.filter((r) => r.method === 'deterministic').length;

  return {
    total: rules.length,
    followed: by('FOLLOWED'),
    violated: by('VIOLATED'),
    notApplicable,
    unverifiable: by('UNVERIFIABLE'),
    coverage: applicable === 0 ? 0 : Math.round((engaged / applicable) * 1000) / 1000,
    deterministicShare: results.length === 0 ? 0 : Math.round((deterministic / results.length) * 1000) / 1000,
  };
}

/**
 * The whole pipeline.
 *
 * Layer A runs first and claims every rule it can prove. Only what is left over
 * reaches the model. That ordering is deliberate: it lowers cost, raises trust,
 * and makes the deterministic share a number we can put on the receipt.
 */
export async function runAudit(input: AuditInput): Promise<AuditOutcome> {
  const { rules, totalTokens } = parseRuleset(input.ruleset, input.artifact ?? 'ruleset');
  const health = runHealth(rules, input.ruleset, totalTokens);

  const results: RuleResult[] = [];
  const forJudge: Rule[] = [];

  for (const rule of rules) {
    const det = runDeterministic(rule, input.output);
    if (det) {
      results.push(det);
      continue;
    }
    // A rule nobody could adjudicate should not be handed to a model and dressed up
    // as a verdict. Saying so costs nothing and is the honest answer.
    if (isUnenforceable(rule.text)) {
      results.push({
        ruleId: rule.id,
        verdict: 'UNVERIFIABLE',
        method: 'structural',
        evidence: [],
        rationale:
          'This rule is too vague to pass or fail. Enforcio will not manufacture a verdict for it — rewrite it as something checkable.',
        engaged: false,
      });
      continue;
    }
    forJudge.push(rule);
  }

  let cost: CostEntry[] = [];

  if (forJudge.length > 0) {
    if (input.deterministicOnly) {
      for (const rule of forJudge) {
        results.push({
          ruleId: rule.id,
          verdict: 'UNVERIFIABLE',
          method: 'structural',
          evidence: [],
          rationale: 'No deterministic checker applies, and adjudication was disabled for this run.',
          engaged: false,
        });
      }
    } else {
      const judged = await runJudge(forJudge, input.output, input.judge ?? {});
      results.push(...judged.results);
      cost = judged.cost;
    }
  }

  // Preserve the ruleset's original order in the receipt.
  const order = new Map(rules.map((r, i) => [r.id, i]));
  results.sort((a, b) => (order.get(a.ruleId) ?? 0) - (order.get(b.ruleId) ?? 0));

  const receipt = sealReceipt({
    version: '1',
    rulesetHash: hashText(input.ruleset),
    outputHash: hashText(input.output),
    engine: {
      parser: PARSER_VERSION,
      deterministic: DETERMINISTIC_VERSION,
      judge: forJudge.length && !input.deterministicOnly ? JUDGE_VERSION : null,
    },
    createdAt: new Date().toISOString(),
    rules,
    results,
    health,
    summary: summarize(rules, results),
    cost,
    previousDigest: input.previousDigest ?? null,
  });

  return { receipt, totalUsd: totalUsd(cost) };
}
