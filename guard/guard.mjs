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

import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
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
const RAN_TESTS = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?t(est)?\b|vitest|jest|pytest|go\s+test|cargo\s+test|mvn\b.*\btest|gradle\b.*\btest|dotnet\s+test|make\b.*\btest|rspec|phpunit|tox|\btest(s)?\.(sh|ps1|bat)\b|run-tests/;
const RAN_COMMIT = /\bgit\s+(commit|push)\b|\bgh\s+pr\s+create\b/;
const NOT_AN_ASSERTION = /\b(not|n't|never|unless|if|once|when|after|before|should|would|could|please|let me know|do you want|shall i|will i|going to|i'll|i will|todo|to do|need to|needs to|make sure|ensure|confirm|verify that)\b/i;

/**
 * The model's own prose, plus every bash command that ran, read from the transcript.
 *
 * TWO filters, and both of them are the difference between evidence and an accusation:
 *
 * ROLE. A transcript interleaves the person's turns with the model's, and both carry
 * `type: 'text'` blocks. Collecting every one of them meant the guard read the USER saying
 * "all tests pass" and then refuted the user — told them, in their own session, that they
 * had lied about something they never claimed. src/lib/preferences.ts does the opposite
 * filter explicitly and says why; the guard had no equivalent.
 *
 * BRANCH. Pressing escape and retrying forks the file, and the abandoned branch stays in
 * it. Reading top to bottom mixes work that was thrown away into "what actually happened" —
 * so a command from a rewound attempt could confirm a claim, or prose from a discarded
 * draft could be checked as though it had been said. src/lib/transcript/parse.ts walks the
 * parentUuid DAG for exactly this reason. Same walk here.
 */
function readTranscript(file) {
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const records = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { /* skip */ }
  }
  if (!records.length) return null;

  // Keep only the surviving branch of the parentUuid DAG.
  const byUuid = new Map();
  const childCount = new Map();
  for (const r of records) if (typeof r.uuid === 'string') byUuid.set(r.uuid, r);
  for (const r of records) {
    if (typeof r.parentUuid === 'string' && byUuid.has(r.parentUuid)) {
      childCount.set(r.parentUuid, (childCount.get(r.parentUuid) ?? 0) + 1);
    }
  }
  const leaves = records.filter((r) => typeof r.uuid === 'string' && !childCount.has(r.uuid));
  const tip = leaves.length ? leaves[leaves.length - 1] : records[records.length - 1];
  const onPath = new Set();
  let cursor = tip;
  while (cursor && typeof cursor.uuid === 'string' && !onPath.has(cursor.uuid)) {
    onPath.add(cursor.uuid);
    cursor = typeof cursor.parentUuid === 'string' ? byUuid.get(cursor.parentUuid) : undefined;
  }
  const path = records.filter((r) => typeof r.uuid !== 'string' || onPath.has(r.uuid));

  const text = [];
  const commands = [];
  let cwd = null;
  let toolCalls = 0;
  for (const rec of path) {
    if (!cwd && typeof rec?.cwd === 'string') cwd = rec.cwd;
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    // Only the model's own words are claims. The person's words are not on trial.
    const isAssistant = rec?.type === 'assistant' || rec?.message?.role === 'assistant';
    for (const part of content) {
      if (isAssistant && part?.type === 'text' && typeof part.text === 'string') text.push(part.text);
      if (part?.type === 'tool_use') {
        toolCalls++;
        if (typeof part?.input?.command === 'string') commands.push(part.input.command);
      }
    }
  }
  return { text: text.join('\n'), commands, cwd, toolCalls };
}

/** Sentence containing an offset, matching src/lib/prevent/claims.ts. */
function sentenceAt(text, idx) {
  const bounds = [0];
  for (const m of text.matchAll(/[.!?](?=\s|$)/g)) bounds.push((m.index ?? 0) + 1);
  bounds.push(text.length);
  let start = 0;
  let end = text.length;
  for (const b of bounds) {
    if (b <= idx) start = b;
    else { end = b; break; }
  }
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Is `full` genuinely inside `base`?
 *
 * `!relative(base, full).startsWith('..')` FAILS OPEN on Windows. Across drives there is no
 * relative route at all, so `relative()` returns an ABSOLUTE path — `D:\\etc\\hosts` — which
 * does not begin with `..`, so the check read "different drive" as "inside the project" and
 * stat'ed a path chosen by model prose. Found by CI on windows-latest, where the checkout is
 * on D: and the temp directory is on C:. Mirrors isInside() in src/lib/prevent/claims.ts.
 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'out', 'npm-dist', '.enforcee']);

/**
 * Find a file by basename inside the project. Mirrors findByBasename() in claims.ts.
 *
 * A bare filename is not a wrong filename. Found by running the checker over our own
 * session: "I added `portability.test.ts`" was REFUTED because the file is at
 * tests/portability.test.ts — a true statement called a lie over a missing directory.
 */
function findByBasename(root, name, depth = 0, budget = { files: 0 }) {
  if (depth > 6 || budget.files > 20000) return null;
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.isDirectory()) continue;
    budget.files++;
    if (e.name === name) return join(root, e.name);
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const hit = findByBasename(join(root, e.name), name, depth + 1, budget);
    if (hit) return hit;
  }
  return null;
}

function isInside(base, full) {
  const b = resolve(base);
  const target = resolve(full);
  if (target === b) return true;
  const rel = relative(b, target);
  if (rel === '') return true;
  if (isAbsolute(rel)) return false;
  return rel.split(/[\\/]/)[0] !== '..';
}

function checkClaimsLocally(text, commands, cwd, toolCalls) {
  const out = [];
  // The positive control. A transcript with no tool calls at all cannot answer a question
  // about which commands ran — "we did not see it" and "it did not happen" are different
  // facts, and reporting the first as the second is a confident accusation from no evidence.
  const usable = toolCalls > 0;
  const ran = (re) => commands.some((c) => re.test(c));
  const settle = (re) =>
    !usable
      ? { verdict: 'UNCHECKABLE', evidence: 'the transcript contains no tool calls — empty, truncated, or not a transcript' }
      : { verdict: ran(re) ? 'CONFIRMED' : 'REFUTED', evidence: 'transcript tool calls' };

  for (const m of text.matchAll(CLAIM_FILE)) {
    const target = m[1];
    // isAbsolute, not startsWith('/') — a Windows absolute path is `C:\...`.
    const full = resolve(isAbsolute(target) ? target : join(cwd, target));
    // The path came out of model prose. A claim about a file outside the project is not one
    // we can adjudicate, and checking it would make this a filesystem oracle the model
    // steers. Same rule as src/lib/prevent/claims.ts.
    const inside = isInside(cwd, full);
    let there = inside && existsSync(full);
    let at = full;
    if (inside && !there && !target.includes('/') && !target.includes('\\')) {
      const found = findByBasename(resolve(cwd), target);
      if (found) { there = true; at = found; }
    }
    out.push({
      kind: 'file-created',
      subject: target,
      verdict: !inside ? 'UNCHECKABLE' : there ? 'CONFIRMED' : 'REFUTED',
      evidence: inside ? `stat ${at}` : `path escapes the session directory (${cwd})`,
    });
  }
  for (const m of text.matchAll(CLAIM_TESTS)) {
    // "I have not committed yet", "If the tests pass, we can ship" — telling the truth
    // about a failure must never be read as claiming a success.
    if (NOT_AN_ASSERTION.test(sentenceAt(text, m.index ?? 0))) continue;
    out.push({ kind: 'tests-pass', subject: 'test suite', ...settle(RAN_TESTS) });
    break;
  }
  for (const m of text.matchAll(CLAIM_COMMIT)) {
    if (NOT_AN_ASSERTION.test(sentenceAt(text, m.index ?? 0))) continue;
    out.push({ kind: 'committed', subject: 'git', ...settle(RAN_COMMIT) });
    break;
  }
  return out;
}

function findPolicy(startDir) {
  let dir = resolve(startDir || process.cwd());
  // 12 hops was a silent cliff: a session running in a directory 12 levels below the
  // project root found no policy, wrote no ledger row, printed nothing, and allowed
  // `rm -rf /` — indistinguishable from a safe command.
  for (let i = 0; i < 64; i++) {
    const p = join(dir, '.enforcee', 'policy.json');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Has this exact load already been recorded for this session?
 *
 * Reads the tail of the ledger rather than holding state, because a hook is a fresh process
 * every time — there is nowhere else to remember. Bounded to the last 400 entries so a long
 * session cannot turn this into a linear scan of a large file on every event.
 */
function alreadyLogged(policyPath, session, filePath, loadReason) {
  if (!policyPath) return false;
  // A dedicated marker file, not a tail of the ledger.
  //
  // The first version scanned the last 400 ledger rows, which is a window rather than a
  // memory: a busy session writes 400 rows between two InstructionsLoaded events without
  // trying, after which the first record scrolls out of view and the same fact is recorded
  // again. The bug it was written to fix — a 3x overcount from claude-code#52176 — simply
  // came back at scale, and only at scale, which is where nobody would look for it.
  //
  // This file holds one small entry per session and is exact regardless of how much else
  // happened. Bounded by pruning old sessions, not by forgetting recent ones.
  const key = `${filePath} ${loadReason}`;
  const path = join(dirname(policyPath), 'loaded.json');
  let state = { sessions: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (Array.isArray(parsed?.sessions)) state = parsed;
  } catch {
    /* absent or corrupt — treated as empty, and rewritten below */
  }

  let entry = state.sessions.find((s) => s.id === session);
  if (entry && Array.isArray(entry.keys) && entry.keys.includes(key)) return true;
  if (!entry) {
    entry = { id: session, keys: [] };
    state.sessions.push(entry);
  }
  if (!Array.isArray(entry.keys)) entry.keys = [];
  entry.keys.push(key);
  // Keep the most recent sessions only. Old ones can never dedupe anything again.
  state.sessions = state.sessions.slice(-32);

  try {
    mkdirSync(dirname(policyPath), { recursive: true });
    writeFileSync(path, JSON.stringify(state), 'utf8');
  } catch {
    // Best-effort. Recording a duplicate is better than breaking a session.
  }
  return false;
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
    // Read the TAIL, not the file.
    //
    // This used to load the whole ledger into a string to look at the last 60 lines. At
    // 644 MB — reachable in a long-lived project, or deliberately — a cold read took 13.3
    // seconds against a 10-second hook timeout, and a timed-out hook is non-blocking. The
    // escalation counter was therefore a way to turn the guard off by writing to its own
    // ledger. 256 KB is far more than 60 rows and is constant work regardless of history.
    const TAIL = 256 * 1024;
    const size = statSync(p).size;
    let text;
    if (size <= TAIL) {
      text = readFileSync(p, 'utf8');
    } else {
      const fd = openSync(p, 'r');
      try {
        const buf = Buffer.allocUnsafe(TAIL);
        readSync(fd, buf, 0, TAIL, size - TAIL);
        text = buf.toString('utf8');
        text = text.slice(text.indexOf('\n') + 1);
      } finally {
        closeSync(fd);
      }
    }
    const lines = text.trim().split('\n');
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
/**
 * Shapes that permit exponential backtracking. A standalone copy of the audit engine's
 * checkRegexSafety, because the guard cannot import from src/ — see the parity test.
 *
 * The audit engine has refused these since the August security audit. The guard did not,
 * and the consequence was worse there: V8's regex engine is not interruptible, so a slow
 * pattern runs past the 10-second hook timeout, and Claude Code treats a timed-out hook as
 * a NON-BLOCKING error. One bad user-authored rule therefore skipped every remaining deny
 * rule — root delete, force push, secret paths, the guard's own self-protection — and the
 * destructive command proceeded. Fail-open, from a rule the user wrote in good faith.
 */
function unsafePattern(source) {
  if (typeof source !== 'string' || source.length > 200) return true;
  // An UNBOUNDED repetition whose body also repeats unboundedly: (x+x+)+, (a+)+, (\w+\s?)+
  //
  // Bounded repetition is not the risk and must not be rejected — the standing library's own
  // rules use shapes like (?:-{1,2}[a-zA-Z-]{1,20}\s+){0,6}, which is capped at 120
  // iterations and cannot blow up. A first cut of this filter flagged those and disarmed
  // nine of the guard's own protections, which is a worse outcome than the bug it fixed.
  const UNBOUNDED = /(?<!\\)[*+]|\{\d+,\}/;
  for (const m of source.matchAll(/\(([^()]*)\)\s*(?:[*+]|\{\d+,\})/g)) {
    const body = m[1] ?? '';
    if (UNBOUNDED.test(body)) return true;
    // Alternation whose branches can match the same text: (a|a)+, (a|ab)+
    const parts = body.split('|');
    if (parts.length > 1 && new Set(parts.map((x) => x.trim())).size < parts.length) return true;
  }

  // POLYNOMIAL blowup, which the nesting rule above does not see at all.
  //
  // Nesting is only the exponential case. A flat SEQUENCE of unbounded quantifiers over
  // overlapping classes backtracks at degree k, and degree 5 is already fatal against an
  // 8 KB subject: `\w+\s*\w+\s*\w+\s*\w+\s*=\s*sk-` — a plausible thing to write to catch
  // an API key assignment — took 117 ms at 60 characters, 3.5 s at 120, and past 180 s at
  // 200. The hook times out at 10 s and a timed-out hook is NON-BLOCKING, so one rule the
  // user wrote in good faith disarmed every remaining deny rule for the session.
  //
  // Three is the line. Every pattern in the standing library sits under it, and a user rule
  // above it is refused loudly as UNCHECKED rather than run — see the caller.
  const unbounded = (source.match(/(?<!\\)[*+](?![?])|\{\d+,\}/g) ?? []).length;
  if (unbounded > 3) return true;

  return false;
}

/**
 * Split a shell command into the pieces that run separately, and drop comments.
 *
 * Matching a whole command line as one string is what let `git push --force origin main
 * # --force-with-lease` through: the force-push rule's `(?!.*--force-with-lease)` lookahead
 * scans to the end of the line, so naming the safe flag ANYWHERE after `push` — in a
 * comment, in a later `echo`, in an unrelated command — disarmed it. The same trick works
 * on any rule using a negative lookahead.
 *
 * Each segment is tested independently, and the whole string is tested too, so a rule that
 * genuinely spans a pipeline still matches.
 */
function segmentsOf(command) {
  if (typeof command !== 'string' || !command) return [];
  const out = [command];
  let stripped = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote && command[i - 1] !== '\\') quote = null;
      stripped += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      stripped += ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(command[i - 1]))) {
      const nl = command.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      stripped += '\n';
      continue;
    }
    stripped += ch;
  }
  if (stripped !== command) out.push(stripped);
  for (const part of stripped.split(/(?:&&|\|\||[;\n]|\|)/)) {
    const t = part.trim();
    if (t && t !== command) out.push(t);
  }
  return out;
}

/**
 * Shape-check only what the user wrote.
 *
 * The standing library's own patterns fail a conservative shape test — `checkRegexSafety`
 * rejects every one of them — and they are nonetheless safe, because they were hardened by
 * MEASUREMENT during the August security audit, not by shape. The rm pattern went from 15.7
 * seconds to fast and was timed to prove it.
 *
 * So the line is origin, and it is a defensible one: ours are vetted by timing, theirs by
 * shape. A first cut applied the shape test to everything and disarmed nine of the guard's
 * own protections — a worse outcome than the bug it was fixing.
 */
function safeRe(pattern, flags, trusted) {
  if (!trusted && unsafePattern(pattern)) return null;
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
    // The CONTENT, not only the path.
    //
    // Every user-authored `forbidden_regex` rule compiles to tool:'*', so a rule like
    // "never write an AWS key" was enforced on Bash and ignored on Write — the same rule,
    // blocked one way and allowed the other, which is worse than not having it, because the
    // install report says it is on. The path stays first so path rules still match early.
    return [i.file_path, i.notebook_path, i.path, i.content, i.new_string, i.old_string, i.new_source]
      .filter((x) => typeof x === 'string')
      .join('\n');
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

  // VALID JSON OF THE WRONG SHAPE is not the same thing as invalid JSON, and only the
  // second was handled. `null`, `{"deny": 7}`, `{"deny": [null]}` all parsed cleanly and
  // then threw a TypeError deep in the rule loop — uncaught, exit 1, EMPTY STDOUT. Claude
  // Code reads that as a non-blocking error, so the call proceeds, and unlike every other
  // failure path in this file it prints nothing at all: no permissionDecision, no
  // systemMessage, no ledger row. Chained with a policy write, it is a permanent silent
  // fail-open. The shape is now normalised once, here, before anything reads it.
  const isRule = (r) => r && typeof r === 'object' && typeof r.pattern === 'string';
  const denyRules = Array.isArray(policy?.deny) ? policy.deny.filter(isRule) : [];
  const warnRules = Array.isArray(policy?.warn) ? policy.warn.filter(isRule) : [];
  const badShape =
    !policy ||
    typeof policy !== 'object' ||
    (policy.deny !== undefined && !Array.isArray(policy.deny)) ||
    (policy.warn !== undefined && !Array.isArray(policy.warn));
  // Entries inside a well-shaped list that are not rules are dropped rather than crashed on,
  // but a dropped rule is a rule that is not enforcing, so it is never dropped quietly.
  const dropped = badShape
    ? 0
    : (Array.isArray(policy.deny) ? policy.deny.length - denyRules.length : 0) +
      (Array.isArray(policy.warn) ? policy.warn.length - warnRules.length : 0);
  if (badShape || dropped > 0) {
    emit({
      systemMessage: badShape
        ? 'Enforcee: policy.json is valid JSON but not a policy, so no rules are being enforced this session. ' +
          'Recompile it with: npx enforcee guard <rules-file>'
        : `Enforcee: ${dropped} entr${dropped === 1 ? 'y' : 'ies'} in policy.json ${dropped === 1 ? 'is' : 'are'} not a usable rule ` +
          `and ${dropped === 1 ? 'was' : 'were'} NOT enforced on this call. Recompile with: npx enforcee guard <rules-file>`,
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
    const filePath = typeof payload.file_path === 'string' ? payload.file_path : null;
    const loadReason = typeof payload.load_reason === 'string' ? payload.load_reason : null;

    // Deduplicate on (session, file_path, load_reason).
    //
    // claude-code#52176, open since 23 April 2026: "InstructionsLoaded hook fires 3x per file
    // per compact event". A reporter with ~50 rules files measured 261 KB of reload against an
    // expected 87 KB. Separately observed here: in headless -p mode, --continue fires a fresh
    // session_start load for the root CLAUDE.md on EVERY turn.
    //
    // Either would make a ledger count of "your rules were loaded N times" wrong by 3x or
    // more — a number that is embarrassing to discover in a customer's screenshot and cheap
    // to prevent here. The de-duplication is the honest reading anyway: the same file loading
    // for the same reason in the same session is one fact, however many times it is announced.
    if (filePath && alreadyLogged(policyPath, base.session, filePath, loadReason)) allow();

    log(policyPath, {
      ...base,
      decision: 'LOADED',
      filePath,
      memoryType: typeof payload.memory_type === 'string' ? payload.memory_type : null,
      loadReason,
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
    if (!t) {
      // A silent skip reads exactly like a clean session. It is not one: it is a session we
      // could not look at. The ledger has to be able to tell those apart afterwards, or
      // "no CLAIM rows" becomes a claim of its own that we never earned.
      log(policyPath, {
        ...base,
        decision: 'CLAIM_SKIPPED',
        reason: typeof payload.transcript_path === 'string' ? 'transcript unreadable or empty' : 'no transcript_path in the hook payload',
        transcript: payload.transcript_path ?? null,
      });
    } else {
      // The transcript records the directory the session actually ran in; the policy's
      // parent is only a guess at it, and a wrong one in a monorepo.
      const claims = checkClaimsLocally(t.text, t.commands, t.cwd || dirname(dirname(policyPath)), t.toolCalls);
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
        `Run \`npx enforcee licence\` to check, or see enforcee.com/pricing. Auditing stays free.`,
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

    // Rules we could not compile or dare not run. Collected rather than skipped, because
    // silently continuing logs ALLOW for a call nothing actually checked — which is the
    // failure this whole product exists to name. deterministic.ts already handles the same
    // situation the opposite way: "we would rather tell you than report a pass we did not earn".
    const unchecked = [];

    // Every command runs against its own segments as well as the whole line, so a negative
    // lookahead cannot be satisfied by text belonging to a different command.
    const parts = toolName === 'Bash' ? segmentsOf(subject) : [subject];
    const hits = (re) => {
      for (const p of parts) {
        re.lastIndex = 0;
        if (re.test(p)) return true;
      }
      return false;
    };

    for (const rule of denyRules) {
      if (!toolMatches(rule.tool, toolName)) continue;
      const re = safeRe(rule.pattern, rule.flags, rule.trusted === true);
      if (!re) {
        unchecked.push(rule);
        continue;
      }
      if (!hits(re)) continue;

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

    for (const rule of warnRules) {
      if (!toolMatches(rule.tool, toolName)) continue;
      const re = safeRe(rule.pattern, rule.flags, rule.trusted === true);
      if (!re || !hits(re)) continue;
      log(policyPath, { ...base, decision: 'WARN', ruleId: rule.id, rule: rule.rule, tool: toolName });
      return emit({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: `Enforcee warning on rule ${rule.id}: ${rule.rule}. ${rule.reason ?? ''}`.trim(),
        },
      });
    }

    if (unchecked.length) {
      log(policyPath, {
        ...base,
        decision: 'UNCHECKED',
        tool: toolName,
        rules: unchecked.map((r) => r.id),
        reason: 'pattern could not be compiled or is unsafe to run',
      });
      return emit({
        systemMessage:
          `Enforcee could not check ${unchecked.length} of your deny rule${unchecked.length === 1 ? '' : 's'} on this call ` +
          `(${unchecked.map((r) => r.id).join(', ')}): the pattern will not compile, or its shape can hang the matcher. ` +
          `This call was NOT blocked and was NOT checked against ${unchecked.length === 1 ? 'that rule' : 'those rules'}. Fix the pattern in .enforcee/policy.json.`,
      });
    }

    // ALLOW rows used to carry no subject at all, so a bypass left no trace anywhere: the
    // ledger showed a wall of identical empty ALLOWs and the one that mattered looked like
    // all the others. A truncated preview is enough to reconstruct what happened without
    // turning the ledger into a copy of the session.
    log(policyPath, { ...base, decision: 'ALLOW', tool: toolName, subject: subject.slice(0, 200) });
    allow();
  }

  if (event === 'PostCompact' || event === 'SessionStart') {
    const text = (policy?.reinject && policy.reinject.text) || '';
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

// A crash here is a bypass, not an error.
//
// Claude Code treats a hook that exits non-zero as a NON-BLOCKING error: the tool call
// proceeds. Every deliberate failure path in this file therefore emits a systemMessage
// saying enforcement is off — but an UNCAUGHT exception emits nothing, so the one case
// where the guard is genuinely broken is the one case the user is never told about. That
// is exactly backwards.
try {
  main();
} catch (err) {
  try {
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          `Enforcee hit an internal error and did NOT check this call: ${(err && err.message) || String(err)}. ` +
          `Nothing was blocked. Recompile with \`npx enforcee guard <rules-file>\`, and please report this.`,
      }) + '\n'
    );
  } catch {
    /* stdout is gone; there is nothing further to try */
  }
  process.exit(0);
}
