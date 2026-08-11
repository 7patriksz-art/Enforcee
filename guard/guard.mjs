#!/usr/bin/env node
/**
 * Enforcee Guard — active enforcement for Claude Code.
 *
 * Zero dependencies. Reads a hook payload on stdin, consults .enforcee/policy.json,
 * and does one of three jobs depending on the hook event:
 *
 *   PreToolUse   → DENY a tool call before it runs. This is enforcement, not reporting.
 *   PostCompact  → re-inject the instructions that Anthropic documents as lost at
 *                  compaction, so they are back in context on the very next turn.
 *   SessionStart → prime the session with the rule digest and open a ledger entry.
 *   Stop         → close the ledger entry for the turn.
 *
 * Every decision is appended to .enforcee/ledger.jsonl so the monitor has a record.
 *
 * Contract (from Claude Code hook docs):
 *   exit 0 + JSON on stdout  → structured decision
 *   exit 2 + text on stderr  → hard block, stdout ignored
 *   any other exit           → non-blocking error, the action proceeds
 * We always exit 0 and speak JSON, so a guard bug can never wedge a session.
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createPublicKey, verify } from 'node:crypto';

/**
 * The licence verification key. Public half of an Ed25519 pair — safe to ship, and it
 * has to be here for the check to work with no network call. Verified locally, on your
 * machine, every session. We never learn that you ran it.
 */
const LICENCE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzUClif/dMJGgcLWGoGv5/v56q7Xk0yGuoRY0r/B7cWU=
-----END PUBLIC KEY-----
`;

/**
 * Find and verify a licence, offline.
 *
 * Search order matches the CLI: env, then project, then home.
 */
function checkLicence(policyDir) {
  let token = process.env.ENFORCEE_LICENCE?.trim();
  if (!token) {
    const candidates = [
      policyDir ? join(policyDir, 'licence') : null,
      join(process.cwd(), '.enforcee', 'licence'),
      join(homedir(), '.enforcee', 'licence'),
    ].filter(Boolean);
    for (const p of candidates) {
      try {
        if (existsSync(p)) {
          token = readFileSync(p, 'utf8').trim();
          break;
        }
      } catch {
        /* unreadable is the same as absent */
      }
    }
  }
  if (!token) return { ok: false, message: 'no licence found, so enforcement is off.' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, message: 'that licence is not readable.' };

  try {
    const good = verify(
      null,
      Buffer.from(parts[0], 'utf8'),
      createPublicKey(LICENCE_PUBLIC_KEY),
      Buffer.from(parts[1], 'base64url')
    );
    if (!good) return { ok: false, message: 'that licence did not verify.' };

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp * 1000 < Date.now()) {
      return { ok: false, message: 'that licence has expired.' };
    }
    return { ok: true, plan: payload.plan, sub: payload.sub };
  } catch {
    return { ok: false, message: 'that licence could not be checked.' };
  }
}

const GUARD_VERSION = 'guard@1.2.0';

/**
 * Longest command line or path any deny pattern is matched against.
 *
 * 8 KB is far above any real command and far below the length at which a backtracking
 * pattern becomes slow enough to hit the hook timeout — which would be read as a
 * non-blocking error and skip every remaining rule.
 */
const MAX_SUBJECT = 8192;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}


// ── Claim checking at Stop ────────────────────────────────────────────────────────────────
//
// The guard cannot import from src/lib — it is standalone and dependency-free by design, so
// it can run as a hook on a machine that has never installed anything. That means a second
// implementation of the claim checks, which is the duplicated-source shape that has bitten
// this project eight times.
//
// Handled by testing BEHAVIOUR rather than bytes: tests/guard-claims-parity.test.ts runs the
// same fixtures through both this code and src/lib/prevent/claims.ts and asserts identical
// verdicts. A byte-comparison would be wrong here, because the two are legitimately
// different code; agreeing on every answer is the property that actually matters.
//
// Everything below is deterministic — a stat() or a scan of the tool calls that ran. The
// guard never makes a model call and never will.

const CLAIM_FILE = /\b(?:created|wrote|added|generated|saved)\s+(?:the\s+)?(?:new\s+)?(?:file\s+)?[`"']([\w./-]+\.[a-z]{1,5})[`"']/gi;
const CLAIM_TESTS = /\b(?:all\s+)?tests?\s+(?:are\s+)?(?:now\s+)?(?:pass(?:ing|ed|es)?|green)\b|\b(?:test\s+suite\s+pass|suite\s+is\s+green)\b/gi;
const CLAIM_COMMIT = /\b(?:committed|pushed)\s+(?:the\s+)?(?:changes?|fix|work|it)\b/gi;
const RAN_TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test|vitest|jest|pytest|go\s+test|cargo\s+test\b/;
const RAN_COMMIT = /\bgit\s+(commit|push)\b/;

/** Last assistant prose, plus every bash command that ran, read from the transcript. */
function readTranscript(file) {
  const text = [];
  const commands = [];
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'text' && typeof part.text === 'string') text.push(part.text);
      if (part?.type === 'tool_use' && typeof part?.input?.command === 'string') commands.push(part.input.command);
    }
  }
  return { text: text.join('\n'), commands };
}

function checkClaimsLocally(text, commands, cwd) {
  const out = [];
  const ran = (re) => commands.some((c) => re.test(c));

  for (const m of text.matchAll(CLAIM_FILE)) {
    const target = m[1];
    const full = target.startsWith('/') ? target : join(cwd, target);
    out.push({
      kind: 'file-created',
      subject: target,
      verdict: existsSync(full) ? 'CONFIRMED' : 'REFUTED',
      evidence: `stat ${full}`,
    });
  }
  if (CLAIM_TESTS.test(text)) {
    CLAIM_TESTS.lastIndex = 0;
    out.push({ kind: 'tests-pass', subject: 'test suite', verdict: ran(RAN_TESTS) ? 'CONFIRMED' : 'REFUTED', evidence: 'transcript tool calls' });
  }
  if (CLAIM_COMMIT.test(text)) {
    CLAIM_COMMIT.lastIndex = 0;
    out.push({ kind: 'committed', subject: 'git', verdict: ran(RAN_COMMIT) ? 'CONFIRMED' : 'REFUTED', evidence: 'transcript tool calls' });
  }
  return out;
}

function findPolicy(startDir) {
  let dir = resolve(startDir || process.cwd());
  for (let i = 0; i < 12; i++) {
    const p = join(dir, '.enforcee', 'policy.json');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function log(policyPath, entry) {
  if (!policyPath) return;
  try {
    const dir = dirname(policyPath);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'ledger.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    /* the ledger is best-effort; never let it break a session */
  }
}

/**
 * Recent decisions from this session, newest last.
 *
 * Needed because of a documented behaviour: when a PreToolUse hook returns
 * permissionDecision "deny", the model frequently retries with a fresh tool_use_id
 * rather than changing approach. Left alone that becomes a loop that burns the user's
 * budget and ends with them deleting the hook. So the guard has to notice it is being
 * argued with and say so louder.
 */
function recentDenials(policyPath, sessionId, ruleId, limit = 60) {
  try {
    const p = join(dirname(policyPath), 'ledger.jsonl');
    if (!existsSync(p)) return 0;
    const lines = readFileSync(p, 'utf8').trim().split('\n');
    let n = 0;
    for (const line of lines.slice(-limit)) {
      try {
        const e = JSON.parse(line);
        if (e.decision === 'DENY' && e.ruleId === ruleId && (!sessionId || e.session === sessionId)) n++;
      } catch {
        /* a half-written line is not worth failing over */
      }
    }
    return n;
  } catch {
    return 0;
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function allow() {
  process.exit(0);
}

/** Build a RegExp, tolerating a bad pattern rather than throwing mid-session. */
function safeRe(pattern, flags) {
  try {
    return new RegExp(pattern, flags ?? 'i');
  } catch {
    return null;
  }
}

/** The text a deny rule should be tested against, per tool. */
function subjectFor(toolName, input) {
  const i = input || {};
  if (toolName === 'Bash') return typeof i.command === 'string' ? i.command : '';
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
    return [i.file_path, i.notebook_path, i.path].filter((x) => typeof x === 'string').join(' ');
  }
  if (toolName === 'WebFetch') return typeof i.url === 'string' ? i.url : '';
  if (toolName === 'Skill') return String(i.skill ?? i.name ?? '');
  // Fall back to the whole input so a rule can still match something meaningful.
  try {
    return JSON.stringify(i);
  } catch {
    return '';
  }
}

function toolMatches(ruleTool, toolName) {
  if (!ruleTool || ruleTool === '*') return true;
  return ruleTool.split('|').map((s) => s.trim()).includes(toolName);
}

function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    allow();
  }

  const event = payload.hook_event_name || process.argv[2] || '';
  const policyPath = findPolicy(payload.cwd);
  if (!policyPath) allow();

  // Enforcement is the paid capability, checked here as well as in the CLI — the CLI gate
  // only covered *writing* policy.json, so a hand-written policy plus this runner was the
  // whole product for free.
  //
  // An unlicensed guard does NOT block anything. Holding someone's work hostage over a
  // subscription would be a hostile thing to do to a person mid-task, and we are not doing
  // it. It steps aside and says why, once.
  let policy;
  try {
    policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  } catch {
    // A malformed policy must never block work. Say so loudly instead.
    emit({
      systemMessage: 'Enforcee: policy.json could not be read, so no rules are being enforced this session.',
    });
  }

  const now = new Date().toISOString();
  const base = { at: now, session: payload.session_id ?? null, event, guard: GUARD_VERSION };

  // ── InstructionsLoaded ────────────────────────────────────────────────────────
  //
  // This is OBSERVED load evidence, and it is worth being precise about why that matters.
  // Until now the product could only say a rule file was *probably* in context —
  // RECONSTRUCTED, which the charter named as its candidate fatal flaw. Claude Code now
  // reports each load directly, and the payload was verified against a live session rather
  // than assumed from the docs, which document only the common fields:
  //
  //   { session_id, transcript_path, cwd, hook_event_name,
  //     file_path, memory_type, load_reason }
  //
  // load_reason observed in practice: session_start (root CLAUDE.md), nested_traversal
  // (a CLAUDE.md in a subdirectory), path_glob_match (a rule with paths: frontmatter).
  // 'include' and 'compact' are documented matcher values that were not reproduced here,
  // so they are recorded verbatim if they arrive rather than being special-cased.
  //
  // Recording only. This event must never block anything — it is evidence collection, and
  // a guard that interfered with loading your own rules would be indefensible.
  //
  // Deliberately ABOVE the licence check. Load evidence belongs to VERIFY, which is free,
  // not to ENFORCE, which is paid. Gating it would have meant an unlicensed guard silently
  // recorded nothing while appearing installed — and 'free inspects, paid enforces' is the
  // line the whole product is priced on.
  if (event === 'InstructionsLoaded') {
    log(policyPath, {
      ...base,
      decision: 'LOADED',
      filePath: typeof payload.file_path === 'string' ? payload.file_path : null,
      memoryType: typeof payload.memory_type === 'string' ? payload.memory_type : null,
      loadReason: typeof payload.load_reason === 'string' ? payload.load_reason : null,
      evidence: 'OBSERVED',
    });
    allow();
  }

  // Above the licence gate, deliberately — and this is the second time that placement has
  // been got wrong on this file. Claim checking is VERIFY, which is free; enforcement is
  // what is paid for. `enforcee verify` is a free command, so gating the hook version would
  // make the same capability free by CLI and paid by hook, which is incoherent.
  if (event === 'Stop' || event === 'SessionEnd') {
    log(policyPath, { ...base, decision: 'SESSION_MARK', transcript: payload.transcript_path ?? null });

    // Check the session's claims before it ends. This is the difference between a tool you
    // remember to run and a safety net: the moment a false claim is most costly is exactly
    // the moment nobody is going to type a command.
    const t = typeof payload.transcript_path === 'string' ? readTranscript(payload.transcript_path) : null;
    if (t) {
      const claims = checkClaimsLocally(t.text, t.commands, dirname(dirname(policyPath)));
      const refuted = claims.filter((c) => c.verdict === 'REFUTED');
      for (const c of claims) {
        log(policyPath, { ...base, decision: 'CLAIM', kind: c.kind, subject: c.subject, verdict: c.verdict, evidence: c.evidence });
      }
      if (refuted.length) {
        // Reported, never blocked. Blocking a turn over a claim check would be the wrong
        // trade: this is an evidence layer, the checks are heuristic about WHICH sentences
        // are claims, and Claude Code overrides a Stop hook after 8 consecutive blocks
        // anyway. Say it plainly and let the person decide.
        return emit({
          systemMessage:
            `Enforcee checked ${claims.length} claim${claims.length === 1 ? '' : 's'} made in this session and ` +
            `${refuted.length} did not hold up: ` +
            refuted.map((c) => `${c.subject} (${c.kind})`).join(', ') +
            `. Full detail in .enforcee/ledger.jsonl.`,
        });
      }
    }
    allow();
  }

  const lic = checkLicence(dirname(policyPath));
  if (!lic.ok) {
    emit({
      systemMessage:
        `Enforcee: ${lic.message} Nothing is being enforced this session — your tools all still work. ` +
        `Run \`npx enforcee licence\` to check, or see enforcee.vercel.app/pricing. Auditing stays free.`,
    });
  }

  if (event === 'PreToolUse') {
    const toolName = payload.tool_name ?? '';
    // Bound what any pattern is run against.
    //
    // V8's regex engine is not interruptible: once .test() starts, nothing stops it —
    // not a timer, not the hook timeout. And Claude Code treats a timed-out hook as a
    // NON-BLOCKING error, so one slow pattern does not merely fail itself, it skips
    // every remaining deny rule. Fail-open is the worst possible failure for a guard,
    // so the input never gets long enough to trigger it. A 240 KB command line is not
    // a real command; it is someone trying to switch the guard off.
    const full = subjectFor(toolName, payload.tool_input);
    const subject = full.slice(0, MAX_SUBJECT);

    // Truncating alone would just move the blind spot to the tail: pad the front with
    // 120 KB of junk and hide the real command past the cut. So an oversized subject is
    // refused outright. No legitimate command line is this long; arriving here means
    // either a generated monster worth a second look, or someone probing the guard.
    // Same principle as the regex refusal — decline and say so, never half-check and pass.
    if (full.length > MAX_SUBJECT) {
      log(policyPath, { ...base, decision: 'DENY', ruleId: 'guard-oversized-input', tool: toolName, subject: subject.slice(0, 400) });
      emit({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `Enforcee did not run this ${toolName} call because its input is ${full.length.toLocaleString()} characters, ` +
            `past the ${MAX_SUBJECT.toLocaleString()} the guard will inspect. An input this large cannot be checked ` +
            `reliably, and passing it unchecked would be worse than refusing it. Split the work into smaller steps, ` +
            `or write the content to a file and act on the file.`,
        },
      });
    }

    for (const rule of policy.deny ?? []) {
      if (!toolMatches(rule.tool, toolName)) continue;
      const re = safeRe(rule.pattern, rule.flags);
      if (!re || !re.test(subject)) continue;

      const priorDenials = recentDenials(policyPath, payload.session_id, rule.id);

      log(policyPath, {
        ...base,
        decision: 'DENY',
        ruleId: rule.id,
        rule: rule.rule,
        tool: toolName,
        subject: subject.slice(0, 400),
        attempt: priorDenials + 1,
      });

      let reason =
        `Blocked by Enforcee rule ${rule.id}: ${rule.rule}\n` +
        (rule.reason ? `${rule.reason}\n` : '') +
        `Matched /${rule.pattern}/ against the ${toolName} input.\n` +
        `This is a hard rule from the user's own ruleset, not a preference. Retrying the same ` +
        `command will produce the same block.`;

      if (priorDenials >= 1) {
        reason +=
          `\n\nThis is attempt ${priorDenials + 1}. The rule has not changed and will not change on retry. ` +
          `Do not reissue this command in any form. Either take a different approach, or stop and ask ` +
          `the user to amend the rule in their ruleset and recompile with: npx enforcee guard <rules-file>`;
      }
      if (priorDenials >= 3) {
        reason +=
          `\n\nSTOP. Four or more attempts have now been blocked by this one rule. Continuing wastes the ` +
          `user's budget. Report the block to the user and wait for instructions.`;
      }

      return emit({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
        systemMessage:
          priorDenials >= 2
            ? `Enforcee has blocked this same rule ${priorDenials + 1} times. If the rule is wrong, edit it and rerun: npx enforcee guard <rules-file>`
            : undefined,
      });
    }

    for (const rule of policy.warn ?? []) {
      if (!toolMatches(rule.tool, toolName)) continue;
      const re = safeRe(rule.pattern, rule.flags);
      if (!re || !re.test(subject)) continue;
      log(policyPath, { ...base, decision: 'WARN', ruleId: rule.id, rule: rule.rule, tool: toolName });
      return emit({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `Enforcee warning on rule ${rule.id}: ${rule.rule}. ${rule.reason ?? ''}`.trim(),
        },
      });
    }

    log(policyPath, { ...base, decision: 'ALLOW', tool: toolName });
    allow();
  }

  if (event === 'PostCompact' || event === 'SessionStart') {
    const text = (policy.reinject && policy.reinject.text) || '';
    if (!text) allow();
    const capped = text.slice(0, 9500);
    log(policyPath, { ...base, decision: 'REINJECT', chars: capped.length });
    return emit({
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: capped,
      },
      systemMessage:
        event === 'PostCompact'
          ? 'Enforcee re-injected your rules after compaction.'
          : undefined,
    });
  }


  allow();
}

main();
