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
MCowBQYDK2VwAyEAK1WUAQxZe6E+Z4yTe4jqoSc3skssi5OH+kEHa2LZ2vA=
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

const GUARD_VERSION = 'guard@1.1.0';

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

  const lic = checkLicence(dirname(policyPath));
  if (!lic.ok) {
    emit({
      systemMessage:
        `Enforcee: ${lic.message} Nothing is being enforced this session — your tools all still work. ` +
        `Run \`npx enforcee licence\` to check, or start a trial at enforcee.vercel.app/pricing.`,
    });
  }

  const now = new Date().toISOString();
  const base = { at: now, session: payload.session_id ?? null, event, guard: GUARD_VERSION };

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

  if (event === 'Stop' || event === 'SessionEnd') {
    log(policyPath, { ...base, decision: 'SESSION_MARK', transcript: payload.transcript_path ?? null });
    allow();
  }

  allow();
}

main();
