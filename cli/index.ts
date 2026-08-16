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
import { proposeDenyRules, compilePolicy, toDenyRule } from '../src/lib/enforce/policy';
import { extractPreferences, toRulesetMarkdown, userTurnsFromTranscript } from '../src/lib/preferences';
import { parseTranscript } from '../src/lib/transcript/parse';
import { analyseCapabilities } from '../src/lib/transcript/findings';
import { checkLocalLicence, setLicence, LICENCE_PATHS } from '../src/lib/licence-local';
import { inferPreconditions, actionShaped } from '../src/lib/prevent/infer';
import { preflight } from '../src/lib/prevent/preconditions';
import { checkClaims } from '../src/lib/prevent/claims';
import { propose, readyToOffer, needsDecision, needsReview, selfCheckable, existingFromRuleset } from '../src/lib/prevent/supersede';
import { loadMemory, saveMemory, noteMention, activeRules, alreadyDeclined, samePreference, decide } from '../src/lib/prevent/memory';
import { createHash } from 'node:crypto';
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
  ${C.bold('enforcee learn')} <conversation-file> [rules]   propose rules from what you already said
  ${C.bold('enforcee learned')}                             what has been learned, and what you decided
  ${C.bold('enforcee accept')}|${C.bold('decline')} <id>              decide on a learned preference
  ${C.bold('enforcee session')} <transcript.jsonl>          what the model could actually see in a session
  ${C.bold('enforcee guard')} <rules-file>                  write .enforcee/ into this project ${C.dim('(licensed)')}
  ${C.bold('enforcee licence set')} <key>                    install a licence on this machine
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

/**
 * Is this a Claude Code session file rather than a pasted conversation?
 *
 * Decided on CONTENT, not on the `.jsonl` extension — a transcript saved as `session.txt` is
 * still a transcript, and mining the assistant's half of it is the bug this exists to stop.
 */
function looksLikeTranscript(raw: string): boolean {
  const first = raw.split('\n').find((l) => l.trim() !== '');
  if (!first) return false;
  try {
    const o = JSON.parse(first) as Record<string, unknown>;
    return typeof o === 'object' && o !== null && ('type' in o || 'message' in o);
  } catch {
    return false;
  }
}

/** Parse JSONL, skipping unparseable lines — a truncated last line is normal in a live file. */
function parseJsonl(raw: string): { type?: string; isCompactSummary?: boolean; isMeta?: boolean; message?: { role?: string; content?: unknown } }[] {
  const out: { type?: string; isCompactSummary?: boolean; isMeta?: boolean; message?: { role?: string; content?: unknown } }[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* ignore */
    }
  }
  return out;
}

function read(path: string | undefined): string {
  // "Not found: undefined" is what a user saw when they typed `enforcee health` with no
  // argument. Guarding here rather than at each call site, because the call sites are
  // exactly where the next command added will forget to do it.
  if (!path) {
    console.error(C.red('Missing a file argument. Run `enforcee` with no arguments to see usage.'));
    process.exit(2);
  }
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

  // --version is checked BEFORE the help fallthrough. It used to come second, and since
  // flags are filtered out of `args`, `enforcee --version` had no cmd, matched the help
  // branch and printed the whole help screen instead of the version. `npm run test:cli`
  // asserted only exit 0, so it passed — the same shape as the hardcoded-version bug.
  if (cmd === 'version' || flags.has('--version')) return console.log(VERSION);
  if (!cmd || cmd === 'help' || flags.has('--help')) return help();

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
    if (!args[1]) {
      console.error(C.red('usage: enforcee learn <file>'));
      process.exit(2);
    }
    // A session transcript is JSONL, not prose. Read it as prose and every line the
    // ASSISTANT wrote — its code, its commit messages, its regexes — is mined back as if the
    // person had said it.
    //
    // Found 2026-08-16 by pointing `learn` at this project's own 413-record transcript, the
    // first time it had ever been run on a real Claude Code session rather than a pasted
    // conversation. It made 61 proposals, including this one, verbatim, as a rule:
    //
    //     Never = /^(and|or|the|a|an|of|in|for|with|to|&)$/i.
    //
    // which is a regex out of src/lib/rules/parse.ts.
    //
    // `userTurnsFromTranscript` already existed, already did exactly this, was already
    // exported, and was called by NOTHING but its own unit test. The test passed while the
    // shipped binary ignored the function, and the site says "Only your words are read —
    // never the assistant's" (src/app/learn/page.tsx:94). That claim was false in the binary
    // people install, and no test could see it, because the test proved a property of a
    // FUNCTION rather than of the PRODUCT.
    //
    // Same defect as selfcheck and verify:ui running in no pipeline: a correct control wired
    // to nothing.
    const raw = read(args[1]);
    const fromTranscript = looksLikeTranscript(raw);
    const text = fromTranscript ? userTurnsFromTranscript(parseJsonl(raw)) : raw;
    if (fromTranscript) {
      // Never let a check silently cover nothing. An empty corpus here reads identically to
      // "no preferences found", which is the difference between "nothing to say" and
      // "nothing was read".
      if (text.length === 0) {
        console.error(C.red('  That transcript contains no human turns this build can read.'));
        console.error(C.grey('  Nothing was analysed — which is not the same as finding nothing.'));
        process.exit(2);
      }
      const pct = ((text.length / raw.length) * 100).toFixed(1);
      console.log(C.grey(`  transcript: your turns only — ${text.length} of ${raw.length} characters (${pct}%)\n`));
    }
    const rulesetRules = args[2] ? parseRuleset(read(args[2]), args[2]).rules : [];
    const existing = args[2] ? new Set(rulesetRules.map((r) => r.id)) : undefined;
    const found = extractPreferences(text, { existingRuleIds: existing });
    if (json) return console.log(JSON.stringify(found, null, 2));

    // Per-project memory. Counts mentions across runs, remembers what was declined, and
    // knows which rules are already active so a new preference cannot silently undo one.
    const memory = loadMemory();
    const today = new Date().toISOString().slice(0, 10);
    // Fingerprint the OCCURRENCE, not the run. Re-reading the same file must not look like
    // the person saying it again — see noteMention.
    for (const c of found) {
      const occurrence = createHash('sha256').update(`${args[1]}|${c.start}|${c.quote}`).digest('hex').slice(0, 16);
      noteMention(memory, c.id, c.rule, c.quote, today, occurrence);
    }

    // Rules already in the user's own ruleset count as things a new preference can
    // contradict — and they are the ones that matter, because they are the ones in force.
    // A rule compiled into the guard is ENFORCED and gets the heavier warning.
    let enforcedIds = new Set<string>();
    const policyFile = join(process.cwd(), '.enforcee', 'policy.json');
    if (existsSync(policyFile)) {
      try {
        const policy = JSON.parse(readFileSync(policyFile, 'utf8')) as { deny?: { ruleId?: string }[] };
        enforcedIds = new Set((policy.deny ?? []).map((d) => d.ruleId).filter((x): x is string => typeof x === 'string'));
      } catch {
        /* a corrupt policy is the guard's problem to report, not a reason to fail here */
      }
    }

    const proposals = propose(found, [...existingFromRuleset(rulesetRules, enforcedIds), ...activeRules(memory)], (c) =>
      memory.entries.find((e) => e.id === c.id || samePreference(e.rule, c.rule))?.mentions ?? 1
    );

    const conflicts = needsDecision(proposals);
    const review = needsReview(proposals);
    // One offer per preference, not per phrasing. Saying the same thing two ways is what
    // reached the threshold in the first place; showing it back twice would be absurd.
    const fresh = readyToOffer(proposals)
      .filter((p) => !alreadyDeclined(memory, p.candidate.id))
      .filter((p, i, all) => all.findIndex((q) => samePreference(q.candidate.rule, p.candidate.rule)) === i);
    const held = proposals.filter((p) => p.disposition.kind === 'new' && p.mentions < 2);

    console.log('');

    // Conflicts first, always. This is the one thing that must not scroll past.
    for (const p of conflicts) {
      console.log(`  ${C.red('NEEDS YOU')} ${C.bold(p.candidate.rule)}`);
      for (const line of p.message.match(/.{1,86}(\s|$)/g) ?? []) console.log(C.grey(`    ${line.trim()}`));
      console.log('');
    }

    for (const p of review) {
      console.log(`  ${C.yellow('OVERLAPS ')} ${C.bold(p.candidate.rule)}`);
      for (const line of p.message.match(/.{1,86}(\s|$)/g) ?? []) console.log(C.grey(`    ${line.trim()}`));
      console.log('');
    }

    for (const p of fresh) {
      const check = selfCheckable(p.candidate);
      console.log(`  ${check.ok ? C.green('READY    ') : C.yellow('WEAK     ')} ${C.bold(p.candidate.rule)}`);
      console.log(C.grey(`    heard ${p.mentions}× · ${check.why}`));
      console.log(C.grey(`    "${p.candidate.quote.replace(/\s+/g, ' ').slice(0, 84)}"`));
      console.log(C.grey(`    accept with: enforcee accept ${p.candidate.id.slice(0, 8)}`));
      console.log('');
    }

    if (held.length) {
      console.log(C.grey(`  ${held.length} heard once, held back — a single remark is not a preference.`));
      console.log('');
    }

    saveMemory(memory);

    if (conflicts.length) {
      console.log(`  ${C.red(C.bold(`${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} with rules you already have. Nothing was changed or removed.`))}`);
      console.log('');
    }

    const offerable = fresh.filter((p) => selfCheckable(p.candidate).ok);
    if (offerable.length) {
      console.log(C.dim('  Nothing below is active. Paste what you want into your ruleset:\n'));
      console.log(toRulesetMarkdown(offerable.map((p) => p.candidate)));
    } else if (!conflicts.length) {
      console.log(C.grey('  Nothing new to offer. That is a real answer, not an empty one.'));
      console.log('');
    }
    return;
  }

  // accept / decline / retire — the missing half of learning.
  //
  // Every status other than `proposed` was unreachable: nothing in the product ever set
  // one, so `activeRules()` returned an empty list on every call and the supersession
  // layer — the part that stops a passing remark quietly undoing a rule you rely on —
  // could never fire. It had tests. It had documentation. It had no way in.
  if (cmd === 'accept' || cmd === 'decline' || cmd === 'retire') {
    const id = args[1];
    if (!id) {
      console.error(C.red(`usage: enforcee ${cmd} <id>   (ids are shown by \`enforcee learned\`)`));
      process.exit(2);
    }
    const memory = loadMemory();
    const status = cmd === 'accept' ? 'accepted' : cmd === 'decline' ? 'declined' : 'retired';
    const entry = decide(memory, id, status, args.slice(2).join(' ') || undefined);
    if (!entry) {
      console.error(C.red(`No learned preference starting with "${id}". Run \`enforcee learned\` to see them.`));
      process.exit(2);
    }
    saveMemory(memory);
    console.log('');
    console.log(`  ${C.bold(status.toUpperCase())}  ${entry.rule}`);
    console.log(
      C.grey(
        status === 'accepted'
          ? '  Recorded. Anything you say later that contradicts this will be raised with you rather than applied.'
          : '  Recorded, and kept — a decision is not a deletion. It will not be proposed again.'
      )
    );
    console.log('');
    return;
  }

  if (cmd === 'learned') {
    const memory = loadMemory();
    if (json) return console.log(JSON.stringify(memory, null, 2));
    console.log('');
    if (!memory.entries.length) {
      console.log(C.grey('  Nothing learned yet in this project. Run `enforcee learn <conversation-file>`.'));
      console.log('');
      return;
    }
    for (const e of memory.entries) {
      const tint = e.status === 'accepted' ? C.green : e.status === 'proposed' ? C.yellow : C.grey;
      console.log(`  ${tint(e.status.padEnd(9))} ${C.dim(e.id.slice(0, 8))}  ${e.rule}`);
      console.log(C.grey(`            heard ${e.mentions}× · first seen ${e.firstSeen}${e.note ? ` · ${e.note}` : ''}`));
    }
    console.log('');
    console.log(C.grey('  enforcee accept <id> · enforcee decline <id> · nothing here is ever deleted.'));
    console.log('');
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
    // `enforcee licence set <key>` — the cross-platform replacement for the bash one-liner
    // the install page used to print. See setLicence() for why that line was a real bug
    // rather than a cosmetic one.
    if (args[1] === 'set') {
      const token = args.slice(2).join(' ');
      const res = setLicence(token);
      console.log('');
      if (!res.ok) {
        console.log(`  ${C.red('✕')} ${res.reason}`);
        console.log(C.grey('  Paste the whole line from your receipt, including the enf1. prefix.'));
        console.log('');
        process.exit(3);
      }
      console.log(`  ${C.green('✓')} Licence installed — ${C.bold(res.path)}`);
      if (res.check.ok) {
        console.log(
          C.grey(`  ${licenceMessage(res.check)} · expires ${new Date(res.check.payload.exp * 1000).toISOString().slice(0, 10)}`)
        );
      }
      console.log(C.grey('  Now run: enforcee guard CLAUDE.md'));
      console.log('');
      return;
    }

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
      console.log(C.grey('    enforcee licence set <your licence>'));
      console.log('');
      process.exit(3);
    }

    const ruleset = read(rulesPath);
    const { rules } = parseRuleset(ruleset, rulesPath);
    const proposals = proposeDenyRules(rules);
    const on = proposals.filter((p) => p.defaultOn);
    const policy = compilePolicy(
      ruleset,
      rules,
      on.filter((p) => p.severity === 'deny').map(toDenyRule),
      on.filter((p) => p.severity === 'warn').map(toDenyRule)
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
    console.log(C.grey('  Add the hook wiring with the installer from enforcee.com/install,'));
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
