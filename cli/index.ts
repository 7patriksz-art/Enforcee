/**
 * Enforcee CLI. Bundled to a single dependency-free file by `npm run build:cli`.
 *
 * Makes zero network calls unless you explicitly pass --judge. That is not a privacy
 * gesture, it is the product: about 80% of a real ruleset is decided by code, so the
 * useful half genuinely does not need a model or an account.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runAudit } from '../src/lib/audit';
import { parseRuleset } from '../src/lib/rules/parse';
import { proposeDenyRules, compilePolicy } from '../src/lib/enforce/policy';
import { extractPreferences, toRulesetMarkdown } from '../src/lib/preferences';
import { parseTranscript } from '../src/lib/transcript/parse';
import { analyseCapabilities } from '../src/lib/transcript/findings';
import type { RuleResult } from '../src/lib/types';

const VERSION = '0.1.0';
const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  grey: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

const VERDICT: Record<RuleResult['verdict'], (s: string) => string> = {
  FOLLOWED: C.green,
  VIOLATED: C.red,
  UNVERIFIABLE: C.yellow,
  NOT_APPLICABLE: C.grey,
};

function help(): void {
  console.log(`
${C.bold('enforcee')} ${C.dim(VERSION)}  ${C.dim('— did your AI actually follow your rules?')}

  ${C.bold('enforcee audit')} <rules-file> <output-file>   audit an output against a ruleset
  ${C.bold('enforcee health')} <rules-file>                 critique the ruleset itself, no output needed
  ${C.bold('enforcee learn')} <conversation-file>           propose rules from what you already said
  ${C.bold('enforcee session')} <transcript.jsonl>          what the model could actually see in a session
  ${C.bold('enforcee guard')} <rules-file>                  write .enforcee/ into this project

  ${C.dim('--judge')}        also adjudicate rules code cannot decide (needs ANTHROPIC_API_KEY)
  ${C.dim('--json')}         emit the receipt as JSON instead of a table
  ${C.dim('--quiet')}        exit code only

Exits non-zero when a rule is VIOLATED, so it works as a CI gate.
`);
}

function read(path: string): string {
  if (!existsSync(path)) {
    console.error(C.red(`Not found: ${path}`));
    process.exit(2);
  }
  return readFileSync(path, 'utf8');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const args = argv.filter((a) => !a.startsWith('--'));
  const cmd = args[0];
  const json = flags.has('--json');
  const quiet = flags.has('--quiet');

  if (!cmd || cmd === 'help' || flags.has('--help')) return help();
  if (cmd === 'version' || flags.has('--version')) return console.log(VERSION);

  if (cmd === 'audit') {
    const [, rulesPath, outputPath] = args;
    if (!rulesPath || !outputPath) return help();
    const ruleset = read(rulesPath);
    const output = read(outputPath);

    const { receipt, totalUsd } = await runAudit({
      ruleset,
      output,
      artifact: rulesPath,
      deterministicOnly: !flags.has('--judge'),
    });

    if (json) console.log(JSON.stringify(receipt, null, 2));
    else if (!quiet) {
      const byId = new Map(receipt.rules.map((r) => [r.id, r]));
      console.log('');
      for (const r of receipt.results) {
        const rule = byId.get(r.ruleId);
        const badge = r.method === 'deterministic' ? C.dim('proof') : r.method === 'judged' ? C.dim('judge') : C.dim('   — ');
        console.log(
          `  ${VERDICT[r.verdict](r.verdict.padEnd(15))} ${badge}  ${rule?.text.slice(0, 78) ?? r.ruleId}`
        );
        if (r.evidence[0]) console.log(C.grey(`                        ${JSON.stringify(r.evidence[0].quote.slice(0, 64))}`));
      }
      const s = receipt.summary;
      console.log('');
      console.log(
        `  ${C.bold(`${Math.round(s.coverage * 100)}% coverage`)}  ·  ${s.violated} violated  ·  ${s.unverifiable} unverifiable  ·  ${Math.round(s.deterministicShare * 100)}% proven by code`
      );
      console.log(C.grey(`  receipt ${receipt.digest.slice(0, 16)}  ·  cost $${totalUsd.toFixed(5)}`));
      console.log('');
    }
    process.exit(receipt.summary.violated > 0 ? 1 : 0);
  }

  if (cmd === 'health') {
    const ruleset = read(args[1]);
    const { receipt } = await runAudit({ ruleset, output: ' ', deterministicOnly: true });
    if (json) return console.log(JSON.stringify(receipt.health, null, 2));
    console.log('');
    if (!receipt.health.length) console.log(C.green('  No structural problems found in this ruleset.'));
    for (const h of receipt.health) {
      const tint = h.severity === 'error' ? C.red : h.severity === 'warn' ? C.yellow : C.grey;
      console.log(`  ${tint(h.code.replace('_', ' ').padEnd(16))} ${h.message}`);
    }
    console.log('');
    process.exit(receipt.health.some((h) => h.severity === 'error') ? 1 : 0);
  }

  if (cmd === 'learn') {
    const text = read(args[1]);
    const existing = args[2] ? new Set(parseRuleset(read(args[2])).rules.map((r) => r.id)) : undefined;
    const found = extractPreferences(text, { existingRuleIds: existing });
    if (json) return console.log(JSON.stringify(found, null, 2));
    console.log('');
    for (const c of found) {
      console.log(`  ${C.bold(c.rule)}`);
      console.log(C.grey(`    ${c.strength} · ${c.basis}`));
      console.log(C.grey(`    "${c.quote.replace(/\s+/g, ' ').slice(0, 90)}"`));
      console.log('');
    }
    if (found.length) console.log(C.dim('  Nothing above is active. Paste what you want into your ruleset:\n'));
    console.log(toRulesetMarkdown(found));
    return;
  }

  if (cmd === 'session') {
    const s = parseTranscript(read(args[1]));
    const findings = analyseCapabilities(s);
    if (json) return console.log(JSON.stringify({ session: { ...s, mainPath: undefined }, findings }, null, 2));
    console.log('');
    console.log(C.grey(`  ${s.total} records · ${s.abandoned} abandoned across ${s.forkPoints.length} rewinds · ${s.toolCalls.length} tool calls`));
    console.log('');
    for (const f of findings) {
      const tint = f.severity === 'error' ? C.red : f.severity === 'warn' ? C.yellow : C.grey;
      console.log(`  ${tint(f.severity.toUpperCase().padEnd(6))} ${C.dim(f.evidence.padEnd(13))} ${f.title}`);
      if (f.items.length) console.log(C.grey(`         ${f.items.slice(0, 8).join(', ')}`));
    }
    console.log('');
    return;
  }

  if (cmd === 'guard') {
    const rulesPath = args[1];
    if (!rulesPath) return help();
    const ruleset = read(rulesPath);
    const { rules } = parseRuleset(ruleset, rulesPath);
    const proposals = proposeDenyRules(rules);
    const on = proposals.filter((p) => p.defaultOn);
    const strip = (p: (typeof proposals)[number]) => ({
      id: p.id, rule: p.rule, tool: p.tool, pattern: p.pattern, flags: p.flags, reason: p.reason,
    });
    const policy = compilePolicy(
      ruleset,
      rules,
      on.filter((p) => p.severity === 'deny').map(strip),
      on.filter((p) => p.severity === 'warn').map(strip)
    );
    mkdirSync('.enforcee', { recursive: true });
    writeFileSync(join('.enforcee', 'policy.json'), JSON.stringify(policy, null, 2));
    console.log('');
    console.log(`  Wrote ${C.bold('.enforcee/policy.json')} — ${policy.deny.length} blocking, ${policy.warn.length} warning.`);
    console.log(C.grey('  Add the hook wiring with the installer from enforcee.vercel.app/install,'));
    console.log(C.grey('  or point .claude/settings.json at .enforcee/guard.mjs yourself.'));
    console.log('');
    return;
  }

  help();
  process.exit(2);
}

main().catch((e) => {
  console.error(C.red(String(e instanceof Error ? e.message : e)));
  process.exit(2);
});
