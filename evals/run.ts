/**
 * Judge eval harness.
 *
 * Runs the gold set through the real judge across several models and reports
 * accuracy, the shape of the errors, and measured cost per audit. This is how
 * the product's price gets set: from numbers, not vibes.
 *
 *   npx tsx evals/run.ts                       # default model set
 *   MODELS=claude-haiku-4-5,claude-sonnet-5 npx tsx evals/run.ts
 */

import { runJudge } from '../src/lib/checks/judge';
import { classify, normalize, ruleId } from '../src/lib/rules/parse';
import { totalUsd, formatUsd } from '../src/lib/cost';
import { GOLD, GOLD_TOTAL, type Expected } from './gold';
import type { CostEntry, Rule } from '../src/lib/types';

function mk(text: string): Rule {
  return {
    id: ruleId(normalize(text)),
    text,
    normalized: normalize(text),
    source: { startLine: 1, endLine: 1, section: [], artifact: 'eval' },
    check: classify(text),
    trigger: null,
    position: 0,
    tokens: Math.ceil(text.length / 4),
  };
}

interface Row {
  caseId: string;
  rule: string;
  expected: Expected;
  got: string;
  agreement: number;
  downgraded: boolean;
  evidenceOk: boolean;
}

async function evalModel(model: string, samples: number) {
  const rows: Row[] = [];
  const cost: CostEntry[] = [];

  for (const c of GOLD) {
    const rules = c.rules.map((r) => mk(r.text));
    const { results, cost: rc } = await runJudge(rules, c.output, { model, samples });
    cost.push(...rc);

    for (let i = 0; i < rules.length; i++) {
      const res = results.find((r) => r.ruleId === rules[i].id);
      const evidenceOk = (res?.evidence ?? []).every((e) => c.output.slice(e.start, e.end) === e.quote);
      rows.push({
        caseId: c.id,
        rule: c.rules[i].text,
        expected: c.rules[i].expect,
        got: res?.verdict ?? 'MISSING',
        agreement: res?.agreement ?? 0,
        downgraded: Boolean(res?.downgraded),
        evidenceOk,
      });
    }
  }

  const correct = rows.filter((r) => r.got === r.expected).length;

  // The two errors that actually matter in an evidence product.
  const falseAccusations = rows.filter((r) => r.got === 'VIOLATED' && r.expected !== 'VIOLATED');
  const missedViolations = rows.filter((r) => r.expected === 'VIOLATED' && r.got !== 'VIOLATED');
  const overconfident = rows.filter((r) => r.expected === 'UNVERIFIABLE' && r.got !== 'UNVERIFIABLE');
  const badEvidence = rows.filter((r) => !r.evidenceOk);

  return { model, rows, correct, falseAccusations, missedViolations, overconfident, badEvidence, cost };
}

async function main() {
  const models = (process.env.MODELS ?? 'claude-haiku-4-5,claude-sonnet-5,claude-opus-5').split(',');
  const samples = Number(process.env.SAMPLES ?? 3);

  console.log(`gold set: ${GOLD.length} scenarios, ${GOLD_TOTAL} labelled rule verdicts`);
  console.log(`samples per audit: ${samples}\n`);

  const summaries: string[][] = [];

  for (const model of models) {
    process.stdout.write(`running ${model} … `);
    const r = await evalModel(model.trim(), samples);
    const acc = (r.correct / GOLD_TOTAL) * 100;
    const usd = totalUsd(r.cost);
    const perAudit = usd / GOLD.length;
    console.log(`${r.correct}/${GOLD_TOTAL} (${acc.toFixed(0)}%)  ${formatUsd(usd)} total`);

    for (const row of r.rows) {
      if (row.got !== row.expected) {
        console.log(
          `   MISS  want ${row.expected.padEnd(15)} got ${String(row.got).padEnd(15)} agree=${row.agreement.toFixed(2)}${row.downgraded ? ' [downgraded]' : ''}  ${row.rule}`
        );
      }
    }

    const cacheRead = r.cost.reduce((n, c) => n + (c.cacheReadTokens ?? 0), 0);
    const cacheWrite = r.cost.reduce((n, c) => n + (c.cacheWriteTokens ?? 0), 0);
    const plainIn = r.cost.reduce((n, c) => n + c.inputTokens, 0);

    summaries.push([
      model,
      `${acc.toFixed(0)}%`,
      String(r.falseAccusations.length),
      String(r.missedViolations.length),
      String(r.overconfident.length),
      String(r.badEvidence.length),
      formatUsd(perAudit),
      `${plainIn}/${cacheWrite}/${cacheRead}`,
    ]);
  }

  console.log('\n' + '='.repeat(112));
  console.log(
    ['model', 'acc', 'false-acc', 'missed-viol', 'overconf', 'bad-evid', 'usd/audit', 'in/cwrite/cread']
      .map((h, i) => h.padEnd([26, 6, 11, 13, 10, 10, 12, 20][i]))
      .join('')
  );
  console.log('-'.repeat(112));
  for (const s of summaries) {
    console.log(s.map((v, i) => v.padEnd([26, 6, 11, 13, 10, 10, 12, 20][i])).join(''));
  }
  console.log('='.repeat(112));
  console.log('\nfalse-acc   = said VIOLATED when it was not. The error that destroys trust.');
  console.log('missed-viol = failed to catch a real violation. The error that makes us useless.');
  console.log('overconf    = gave a verdict where the honest answer was UNVERIFIABLE.');
  console.log('bad-evid    = an evidence span that did not match the output. Must always be 0.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
