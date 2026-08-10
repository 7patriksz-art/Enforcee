/**
 * Enforcee CLI. Bundled to a single dependency-free file by `npm run build:cli`.
 *
 * Makes zero network calls unless you explicitly pass --judge. That is not a privacy
 * gesture, it is the product: about 80% of a real ruleset is decided by code, so the
 * useful half genuinely does not need a model or an account.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../src/lib/audit';
import { parseRuleset } from '../src/lib/rules/parse';
import { proposeDenyRules, compilePolicy } from '../src/lib/enforce/policy';
import { extractPreferences, toRulesetMarkdown } from '../src/lib/preferences';
import { parseTranscript } from '../src/lib/transcript/parse';
import { analyseCapabilities } from '../src/lib/transcript/findings';
import { checkLocalLicence, LICENCE_PATHS } from '../src/lib/licence-local';
import { inferPreconditions, actionShaped } from '../src/lib/prevent/infer';
import { preflight } from '../src/lib/prevent/preconditions';
import { checkClaims } from '../src/lib/prevent/claims';
import { licenceMessage } from '../src/lib/licence';
import type { RuleResult } from '../src/lib/types';

/**
 * Injected at build time from package.json — see the --define in build:cli.
 *
 * This was a hardcoded '0.1.0' through eight releases, so `enforcee --version` lied to every
 * user and every bug report carried the wrong number. Seventh instance of the same shape on
 * this project: a value in two places, one updated, the other forgotten.
 */
declare const __ENFORCEE_VERSION__: string;
const VERSION = typeof __ENFORCEE_VERSION__ === 'string' ? __ENFORCEE_VERSION__ : '0.0.0-dev';
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
  ${C.bold('enforcee preflight')} <rules-file>              check what your rules assume, before you start
  ${C.bold('enforcee verify')} <output> [transcript]       did it do what it said it did?
  ${C.bold('enforcee health')} <rules-file>                 critique the ruleset itself, no output needed
  ${C.bold('enforcee learn')} <conversation-file>           propose rules from what you already said
  ${C.bold('enforcee session')} <transcript.jsonl>          what the model could actually see in a session
  ${C.bold('enforcee guard')} <rules-file>                  write .enforcee/ into this project ${C.dim('(licensed)')}
  ${C.bold('enforcee licence')}                             show the licence this machine is using

  ${C.dim('--judge')}        also adjudicate rules code cannot decide (needs ANTHROPIC_API_KEY)
  ${C.dim('--json')}         emit the receipt as JSON instead of a table
  ${C.dim('--quiet')}        exit code only

Exits non-zero when a rule is VIOLATED, or when preflight finds a missing precondition,
so both work as a CI gate.

${C.dim('audit, health, learn and session need no account, no key and no network.')}
${C.dim('guard needs a licence, checked offline against a key compiled into this binary.')}
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

  // preflight — check what the rules assume BEFORE anything runs.
  //
  // Free, and deliberately so: this is VERIFY, not ENFORCE. It also has no model call and no
  // network, so there is nothing to meter and nothing to gate.
  if (cmd === 'preflight') {
    // args[0] is the command itself — every other branch destructures past it.
    const [, rulesPath] = args;
    if (!rulesPath) {
      console.error(C.red('usage: enforcee preflight <rules-file>'));
      process.exit(2);
    }
    const { rules } = parseRuleset(read(rulesPath), rulesPath);
    const inferred = inferPreconditions(rules);
    const report = preflight(inferred);
    const actions = actionShaped(rules);

    console.log('');
    if (!inferred.length) {
      console.log(C.grey('  Nothing in this ruleset names a tool, file or variable it depends on.'));
      console.log(C.grey('  That is a fine answer — it means there is nothing to check before you start.'));
    }
    for (const r of report.met) {
      console.log(`  ${C.green('ok    ')} ${r.precondition.target}  ${C.grey(r.evidence)}`);
    }
    for (const r of report.missing) {
      console.log(`  ${C.red('MISSING')} ${r.precondition.target}  ${C.grey(r.detail)}`);
      console.log(`          ${C.grey(r.precondition.why)}`);
    }
    if (inferred.length) {
      console.log('');
      console.log(report.ready ? `  ${C.bold(report.summary)}` : `  ${C.red(C.bold(report.summary))}`);
    }

    if (actions.length) {
      console.log('');
      console.log(`  ${C.bold(String(actions.length))} rule${actions.length === 1 ? '' : 's'} ask whether an action happened.`);
      console.log(C.grey('  Auditing an output cannot settle those — no tool can read a text answer and'));
      console.log(C.grey('  learn whether an email was sent or an approval was obtained. Listed so they are'));
      console.log(C.grey('  not quietly counted as passing:'));
      for (const a of actions.slice(0, 5)) console.log(C.grey(`    · ${a.text.slice(0, 88)}`));
      if (actions.length > 5) console.log(C.grey(`    · …and ${actions.length - 5} more`));
    }
    console.log('');
    // Non-zero when something is missing, so it gates a pipeline step the same way audit does.
    process.exit(report.ready ? 0 : 1);
  }

  // verify — did what it said it did actually happen?
  //
  // Free and deterministic. No model call: every check here is a stat() or a scan of the
  // tool calls in the transcript. The prose-judgement version of this belongs behind the
  // same evidence gate as the audit judge, and is deliberately not mixed in here.
  if (cmd === 'verify') {
    const [, claimsPath, transcriptPath] = args;
    if (!claimsPath) {
      console.error(C.red('usage: enforcee verify <output-file> [transcript.jsonl]'));
      process.exit(2);
    }
    const session = transcriptPath ? parseTranscript(read(transcriptPath)) : undefined;
    const report = checkClaims(read(claimsPath), { cwd: process.cwd(), session });

    console.log('');
    for (const c of report.checked) {
      const tag = c.verdict === 'CONFIRMED' ? C.green('CONFIRMED  ') : c.verdict === 'REFUTED' ? C.red('REFUTED    ') : C.yellow('UNCHECKABLE');
      console.log(`  ${tag} ${c.reason}`);
      console.log(C.grey(`              "${c.quote.slice(0, 96)}"`));
      console.log(C.grey(`              ${c.evidence}`));
    }
    console.log('');
    console.log(report.refuted ? `  ${C.red(C.bold(report.summary))}` : `  ${C.bold(report.summary)}`);
    if (!transcriptPath) {
      console.log(C.grey('  Pass a transcript to also check claims about tests and commits.'));
    }
    console.log('');
    process.exit(report.refuted > 0 ? 1 : 0);
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

  if (cmd === 'licence' || cmd === 'license') {
    const check = checkLocalLicence();
    console.log('');
    if (check.ok) {
      console.log(`  ${C.green('✓')} ${licenceMessage(check)}`);
      console.log(C.grey(`  expires ${new Date(check.payload.exp * 1000).toISOString().slice(0, 10)} · from ${check.from}`));
    } else {
      console.log(`  ${C.yellow('•')} ${licenceMessage(check)}`);
      console.log(C.grey(`  Looked in ENFORCEE_LICENCE, ${LICENCE_PATHS.project}, ${LICENCE_PATHS.home}`));
    }
    console.log('');
    console.log(C.grey('  audit, health, learn and session work regardless — they always will.'));
    console.log('');
    return;
  }

  if (cmd === 'guard') {
    const rulesPath = args[1];
    if (!rulesPath) return help();

    // Checked offline. No network call, no account, no activation server — just a
    // signature against a key compiled into this file.
    const lic = checkLocalLicence();
    if (!lic.ok) {
      console.log('');
      console.log(`  ${C.yellow('The guard is the part we charge for.')}`);
      console.log(`  ${C.grey(licenceMessage(lic))}`);
      console.log('');
      console.log(C.grey('  What you can still do right now, free and unlimited:'));
      console.log(C.grey(`    enforcee audit ${rulesPath} <output-file>   which rules were actually followed`));
      console.log(C.grey(`    enforcee health ${rulesPath}                what is wrong with the ruleset itself`));
      console.log('');
      console.log(C.grey('  Already subscribed? Paste your licence:'));
      console.log(C.grey(`    mkdir -p ~/.enforcee && echo "<licence>" > ${LICENCE_PATHS.home}`));
      console.log('');
      process.exit(3);
    }

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

    // Ship the runner alongside the policy. Writing only policy.json and then telling the
    // user to point their settings at .enforcee/guard.mjs left them wiring a hook to a
    // file that was never created — the hook then fails silently, which for a *paid*
    // guard means it looks installed and blocks nothing. Copy it, or say we could not.
    let runner = false;
    try {
      // In the published package this file sits at dist/enforcee.mjs and the runner at
      // guard/guard.mjs, i.e. one level up and across. Running from source, the same
      // relative walk lands on the repo's guard/ directory.
      const here = dirname(fileURLToPath(import.meta.url));
      for (const candidate of [join(here, '..', 'guard', 'guard.mjs'), join(here, '..', '..', 'guard', 'guard.mjs')]) {
        if (existsSync(candidate)) {
          copyFileSync(candidate, join('.enforcee', 'guard.mjs'));
          chmodSync(join('.enforcee', 'guard.mjs'), 0o755);
          runner = true;
          break;
        }
      }
    } catch {
      runner = false;
    }

    console.log('');
    console.log(`  Wrote ${C.bold('.enforcee/policy.json')} — ${policy.deny.length} blocking, ${policy.warn.length} warning.`);
    if (runner) {
      console.log(`  Wrote ${C.bold('.enforcee/guard.mjs')} — the runner your hook points at.`);
    } else {
      console.log(C.yellow('  Could not find the guard runner to copy — the hook has nothing to run.'));
      console.log(C.grey('  Reinstall with `npm i -g enforcee`, or copy guard/guard.mjs from the package yourself.'));
    }
    console.log(C.grey(`  ${licenceMessage(lic)}`));
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
