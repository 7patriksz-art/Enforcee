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

const GUARD_VERSION = 'guard@1.0.0';

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

  if (event === 'PreToolUse') {
    const toolName = payload.tool_name ?? '';
    const subject = subjectFor(toolName, payload.tool_input);

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
