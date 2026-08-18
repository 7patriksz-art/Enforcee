/**
 * OBSTACLES — what already blocked this project, learned from what actually happened.
 *
 * ── The measurement that produced this file ──
 *
 * Over two real session transcripts of this project (787 records, 406 tool results):
 *
 *     78 tool results carried a prerequisite failure  (19%)
 *     48 of 48 recognised failures were a signature ALREADY SEEN in the same history
 *
 * One hundred percent. Not "most" — every one. Four separate times a push failed with
 * `could not read Username for https://github.com`, and the fix was written down in this
 * project's own charter the whole time. Eight times a request died on the same blocked host.
 * Twenty times an HTTP 401 came back from a credential that had already been shown not to
 * work.
 *
 * That is the entire product thesis, measured on ourselves: THE AGENT DOES NOT RE-READ ITS
 * OWN HISTORY, so it walks into the same wall until a human says "you keep doing this".
 *
 * ── Why this is not `learn` ──
 *
 * `learn` mines what the USER SAID. It needs Patrik to have typed a preference, and his
 * standing objection is exact: *"Enforcee should learn these itself from actions and actual
 * in-flight coding sessions, not me pointing at every error."*
 *
 * This mines what the MACHINE HIT. A 403 is not an opinion — it is a labelled failure with a
 * timestamp, sitting in the transcript, requiring nobody's attention to become a fact. That
 * makes obstacles the half of learning that needs no user at all.
 *
 * ── Why signatures rather than messages ──
 *
 * A raw error string is unique per run — it carries a path, a port, a timestamp. Recorded
 * literally, the same wall never looks like the same wall. A SIGNATURE is the reusable part:
 * `egress blocked: api.supabase.com` rather than the whole curl transcript. Two failures
 * share a signature exactly when the same precaution would have prevented both.
 *
 * ── The honesty constraint ──
 *
 * A remedy that has not been observed to work is a GUESS, and this project has already paid
 * for guessed remedies twice — an invented Resend settings screen, and an error message's own
 * suggested fix that turned out not to exist. So `resolution` is only ever set from something
 * observed succeeding afterwards in the same transcript, and `confidence` says which.
 * A remedy nobody has run is reported as UNVERIFIED, never as the answer.
 */

export type ObstacleKind = 'credential' | 'network' | 'environment' | 'tooling';

/**
 * Bumped whenever a PATTERN changes meaning.
 *
 * Signatures are produced by patterns, so a stored obstacle is only interpretable under the
 * patterns that made it. When `/\b401\b/` was tightened to require HTTP context, every stored
 * "HTTP 401" count became a number that could never be reproduced — and it kept being
 * displayed as though it were current. A store that survives the code that wrote it is a
 * store that lies.
 */
// v3, 2026-08-18: every pattern now ignores a match sitting on a comment line. Counts taken
// under v2 included mentions — this file's own 401 comment was four of them — so they cannot
// be reproduced by the code that reads them, which is the exact condition this number exists
// to detect. See matchIsMention.
export const PATTERNS_VERSION = 3;

export interface Obstacle {
  /** Stable id over the signature — the same wall keeps the same id across sessions. */
  id: string;
  kind: ObstacleKind;
  /** The reusable fact, with the per-run noise stripped out. */
  signature: string;
  /** How many times this project has hit it. The number that makes the case. */
  hits: number;
  /**
   * Fingerprints of the individual failures counted, so re-reading the same transcript is
   * IDEMPOTENT.
   *
   * The first version merged blindly: `hits += o.hits`. Patrik re-ran the scan over the same
   * sessions and the top line went from 762 to 1143 — a number that measured how many times
   * the TOOL had run, presented as how many times the wall had been hit. `learn` already had
   * this exact discipline ("Fingerprint the OCCURRENCE, not the run"); I did not carry it
   * across, so the same bug shipped twice on this project in two different features.
   */
  seen: string[];
  /** A verbatim slice of the failure, so a human can confirm it is really this. */
  evidence: string;
  /**
   * What was observed to work afterwards — never a guess.
   * `undefined` means nothing has been seen to fix this yet, and it must be reported that way.
   */
  resolution?: string;
  confidence: 'observed' | 'unverified';
}

/**
 * Failure patterns, each mapped to the reusable signature and — where this project has
 * ACTUALLY observed a fix — the command that was seen to work.
 *
 * Ordered most specific first: `x-deny-reason: host_not_allowed` and a generic 403 describe
 * the same event, and attributing it to the generic one would send someone to rotate a
 * perfectly good credential. That exact mistake nearly happened on 2026-08-16.
 */
interface Pattern {
  kind: ObstacleKind;
  re: RegExp;
  /** `$1` is substituted from the first capture group. */
  signature: string;
  /** Only set where this repo has watched it succeed. Anything else stays undefined. */
  observedFix?: string;
}

export const PATTERNS: Pattern[] = [
  {
    kind: 'network',
    re: /Host not in allowlist:\s*([a-z0-9.\-]+)/i,
    signature: 'egress blocks $1',
    // No fix: this is the sandbox allowlist and the proxy bypass does NOT help. Verified
    // 2026-08-16 against api.supabase.com — `x-deny-reason: host_not_allowed` with the proxy
    // unset. Saying "bypass the proxy" here would be a remedy that has been proven not to work.
    observedFix: 'Not solvable in-sandbox — the proxy bypass does not help. Run it where the internet is plain (a GitHub runner, or the task on your own computer).',
  },
  {
    kind: 'network',
    re: /(CONNECT tunnel failed, response 403)/i,
    signature: 'the proxy refuses CONNECT',
    observedFix: 'env -u https_proxy -u HTTPS_PROXY -u http_proxy -u HTTP_PROXY <command>',
  },
  {
    kind: 'credential',
    re: /could not read Username for .(https:\/\/[a-z0-9.\-]+)/i,
    signature: 'git has no stored credential for $1',
    observedFix: 'Push to an explicit URL with the PAT, then `git fetch origin` so the tracking ref stops lying.',
  },
  {
    kind: 'environment',
    re: /fatal: not a git repository/i,
    signature: 'the working directory is not the repo',
    observedFix: 'The container rolled back. `cd` to the repo, then `git fetch origin && git reset --hard origin/main` — everything pushed survives.',
  },
  {
    // Only a BARE PACKAGE NAME is a prerequisite — something that should have been installed.
    // `Cannot find module './lib/scoring.js'` is TypeScript complaining about the project's
    // own source, and `Cannot find module 'C:\\Users\\...\\scratchpad\\check.mts'` is a
    // scratch file from one session that will never exist again. Both are events, not walls.
    //
    // Patrik's run produced 20 of the 28 obstacles as one-per-path noise of exactly that kind,
    // burying the two lines that mattered. An obstacle ledger that lists every transient is a
    // log, and nobody re-reads a log — which is the entire failure this file exists to fix.
    kind: 'tooling',
    re: /Cannot find module ['"]((?:@[\w.\-]+\/)?[\w.\-]+)['"]/,
    signature: 'package not installed: $1',
  },
  {
    // Name the binary. "a required binary is not on PATH — hit 56x" is a true statement that
    // tells you nothing and cannot be acted on. The real output was `shot: command not found`,
    // `render.ts: command not found`, `BeatScene: command not found` — three different
    // problems collapsed into one useless line.
    kind: 'tooling',
    re: /(?:^|[\s/])([\w.\-]+): command not found/m,
    signature: 'binary not on PATH: $1',
  },
  {
    kind: 'tooling',
    re: /(command not found|not found in PATH)/i,
    signature: 'a required binary is not on PATH',
  },
  {
    kind: 'tooling',
    re: /npm error could not determine executable to run/i,
    signature: 'npx package exposes no runnable bin',
  },
  {
    // MUST require HTTP context. The first shipped version was `/\b(401|Unauthorized)\b/`,
    // which matches the bare number 401 anywhere in any output. Measured on 4,277 real tool
    // results: 56 matches, 20 genuinely HTTP-shaped — a 64% FALSE POSITIVE RATE. On Patrik's
    // own machine it inflated one line to "hit 762x", and the evidence behind the top hit was
    // the phrase "anon insert 401" inside a prose sentence about telemetry.
    //
    // Among the things it accused of being a rejected credential: our own test case
    // `it('still recognises a genuine 401 as a credential problem')`, and the printed output
    // of the measurement that justified building this file. A false-accusation generator, in
    // the product whose headline is zero false accusations.
    kind: 'credential',
    re: /(?:HTTP[/ ]?[\d.]*\s*401\b|"?status"?[:\s]+401\b|\b401\s+(?:Unauthorized|Client Error)|code"?[:\s]+401\b|->\s*401\b|\bUnauthorized\b)/i,
    signature: 'HTTP 401 — the credential was rejected',
    observedFix: 'Test the token against an authenticated endpoint before using it. A successful `git ls-remote` proves nothing: the repo is public.',
  },
];

/** Deterministic id, so the same wall keeps the same id across machines and sessions. */
export function obstacleId(signature: string): string {
  let h = 2166136261;
  for (let i = 0; i < signature.length; i++) {
    h ^= signature.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Secret shapes that must never survive into a stored obstacle.
 *
 * Evidence is a verbatim slice of a failure, and failures are exactly where credentials show
 * up — an auth header echoed back, a token in a remote URL, a key in a rejected request body.
 * `.enforcee/obstacles.json` is a file people will paste into an issue or hand to us for
 * support, so a token surviving here is a token leaked by the tool that exists to make things
 * safer.
 *
 * Charter: never commit a secret, a token or a licence key. This is that rule applied to the
 * one place on the path where secrets are most likely and least expected.
 */
const SECRET_SHAPES: [RegExp, string][] = [
  [/gh[pousr]_[A-Za-z0-9]{16,}/g, 'github_pat_<redacted>'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_<redacted>'],
  [/\bsbp_[A-Za-z0-9]{16,}/g, 'sbp_<redacted>'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, 'sk-<redacted>'],
  [/\bvcp_[A-Za-z0-9]{16,}/g, 'vcp_<redacted>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<jwt-redacted>'],
  // A credential in a URL's userinfo section — the "name:password@" that precedes a host.
  // Deliberately NOT written out as an example here: comments survive into the bundle, and
  // `npm run pack:cli` scans the shipped file for anything endpoint-shaped so nobody can
  // slip a network call into the free CLI. A URL-shaped comment trips that control, and the
  // right response is to keep the control sharp rather than add an exception for prose.
  [/(https?:\/\/)[^\s:@/]+:[^\s@/]+@/g, '$1<credentials-redacted>@'],
  [/(Authorization:\s*(?:Bearer|Basic)\s+)\S+/gi, '$1<redacted>'],
];

/** Strip anything secret-shaped. Applied before storage, never after. */
export function redact(s: string): string {
  let out = s;
  for (const [re, to] of SECRET_SHAPES) out = out.replace(re, to);
  return out;
}

/**
 * Normalise a captured value before it becomes a signature.
 *
 * A tool result that arrived as JSON has its backslashes doubled, so the same Windows path
 * hashes to two different obstacles. Patrik's first real run listed eight such pairs — the
 * "same wall collapses to one signature" property failing on the first real input.
 *
 * Exported and tested directly because, since `Cannot find module` was narrowed to bare
 * package names, no current pattern captures a value that can contain a backslash. Testing
 * it through `extractObstacles` would pass for the wrong reason — both inputs are now simply
 * ignored — which proves nothing about the normaliser.
 */
export function normaliseCapture(v: string): string {
  return v.replace(/\\{2,}/g, '\\').replace(/[.,;]+$/, '').trim();
}

/**
 * ── READING ABOUT A FAILURE IS NOT HITTING ONE ─────────────────────────────────────────────
 *
 * Found 2026-08-18, live, by this file's own sweep. The scan of the run's own transcript
 * filed:
 *
 *     4×  HTTP 401 — the credential was rejected              credential
 *         → Test the token against an authenticated endpoint before using it.
 *
 * Nothing in that run ever saw a 401. The evidence stored behind it was:
 *
 *     "01 pattern was tightened, every stored \"HTTP 401\" count became a number nothing
 *      could // reproduce — and it kept being shown as though it were current."
 *
 * — the comment in THIS FILE, at line 52, that documents the LAST time the 401 pattern
 * false-accused somebody. The tool result was a `sed -n` of the source. The agent read a file
 * about 401s and the product recorded that its credentials had been rejected, then offered a
 * remedy for rotating a token that was working perfectly.
 *
 * The 08-16 tightening fixed bare numbers (`/\b401\b/`, 64% false positives) by requiring HTTP
 * context. It could not fix this, because `"HTTP 401"` in a sentence ABOUT a 401 has perfect
 * HTTP context. No amount of tightening the pattern reaches it: the string really is there.
 * What is missing is not specificity, it is the difference between an EVENT and a MENTION.
 *
 * A source comment is a mention. A real 401 arrives as `HTTP/1.1 401 Unauthorized` or
 * `{"status":401}` on its own line, never behind `//` or ` * `. So the discriminator is the
 * line the match sits on, and it is general — it protects every pattern, not just this one.
 * `fatal: not a git repository` in a README and `command not found` in a docstring are the
 * same bug waiting on a different user.
 *
 * ── Not tightened until it accuses nobody ──
 *
 * The opposite failure is refusing to see a real wall, and it is just as bad. So this drops
 * only the MATCH, not the tool result: a file containing both a comment about 401s and a real
 * 401 still files the real one, because matching continues past the mention. And every marker
 * here is one that cannot begin a line of genuine failure output. `-`, `+` and `>` are
 * deliberately absent: a diff line and a quoted line look identical to a stack frame indented
 * by a shell, and guessing there is how a checker stops checking.
 *
 * Both directions are asserted in `tests/obstacles-mentions.test.ts`.
 */
// Leading backslashes are tolerated because a line break inside a JSON-encoded tool result
// survives as the two characters \ and n, and the fragment after it keeps them.
//
// `grep -n` and `sed -n '=p'` put `<file>:<line>:` or `<line>:` in front of every line they
// print, which pushes the comment marker off the start and hid seven of the eleven mentions
// measured on 2026-08-18. Reading a file through grep is the commonest way an agent looks at
// source at all, so not seeing through that prefix means the guard misses the majority case.
const GREP_PREFIX = /^[\s\\]*(?:[^\s:]*:)?\d+[:-]/;
const MENTION_LINE = /^[\s\\]*(?:\/\/|\/\*|\*|#|<!--)/;

/**
 * The line the match sits on — where "line" means what a reader sees, not what `split('\n')`
 * returns.
 *
 * `toolResultsFromRecords` stores the `toolUseResult` sidecar as `JSON.stringify(...)`, so a
 * multi-line file read arrives as ONE physical line with every break encoded as the two
 * characters `\` and `n`. The first version of this guard looked for real newlines only, and
 * on the very corpus that motivated it the comment markers were all still there and none of
 * them were at a line start, so it changed nothing at all — the false 401 came straight back,
 * count intact. A guard that cannot see the shape its own input actually arrives in is a
 * guard that has never run.
 */
function lineAround(raw: string, index: number): string {
  const realStart = raw.lastIndexOf('\n', index) + 1;
  const esc = raw.lastIndexOf('\\n', index);
  const escStart = esc !== -1 && esc + 2 <= index ? esc + 2 : 0;
  const start = Math.max(realStart, escStart);

  const realEnd = raw.indexOf('\n', index);
  const escEnd = raw.indexOf('\\n', index);
  const ends = [realEnd, escEnd].filter((n) => n !== -1);
  const end = ends.length ? Math.min(...ends) : raw.length;

  return raw.slice(start, end);
}

/** Is the match at `index` sitting on a line that is talking about a failure, not reporting one? */
export function matchIsMention(raw: string, index: number): boolean {
  const line = lineAround(raw, index);
  return MENTION_LINE.test(line) || MENTION_LINE.test(line.replace(GREP_PREFIX, ''));
}

/** Global twin of each pattern, built once, so matching can step past a mention to a real hit. */
const GLOBAL_RE = new WeakMap<RegExp, RegExp>();
function globalOf(re: RegExp): RegExp {
  let g = GLOBAL_RE.get(re);
  if (!g) {
    g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    GLOBAL_RE.set(re, g);
  }
  return g;
}

/**
 * -- AND THE TOOL MUST NOT READ ITS OWN REPORT ----------------------------------------------
 *
 * The third false accusation found in the same 2026-08-18 run, after the mention guard above
 * had already caught two. With comments excluded, two matches still survived, and both were
 * the ANSI-coloured line
 *
 *     6x    HTTP 401 - the credential was rejected    credential
 *
 * that `enforcee obstacles` had itself printed a few minutes earlier, captured as a tool
 * result by the very session being scanned. A report line is not a comment, so nothing above
 * stops it.
 *
 * It is the worst shape of the three because it is a ratchet: once an obstacle is filed, every
 * later scan re-files it from the printout of the scan before, and the count climbs on its own
 * for as long as anyone keeps running the command. The occurrence fingerprints do not help --
 * each printout is a genuinely new tool result at a new index, so it is honestly counted as a
 * new sighting of a thing that never happened again. This project has already shipped a hits
 * number that measured how many times the TOOL had run (762x); this is that same lie arriving
 * through a different door.
 *
 * Matched on our own printed furniture rather than on the signatures, so it costs nothing per
 * pattern and cannot be defeated by adding one. Both directions are in
 * `tests/obstacles-mentions.test.ts`: a real report is skipped, and a genuine failure that
 * merely says the word "obstacles" is not.
 */
const OWN_REPORT = [
  /\d+\s+tool results across \d+ session/i,
  /## Known obstacles in this project/i,
  /Nothing recognised blocked this project/i,
  /No remedy (?:has been )?observed yet/i,
];

/** Is this tool result Enforcee's own obstacle report being read back in? */
export function isOwnReport(raw: string): boolean {
  return OWN_REPORT.some((re) => re.test(raw));
}

/** First match in `raw` that is an event rather than a mention, or null when there is none. */
export function firstRealMatch(re: RegExp, raw: string): RegExpExecArray | null {
  const g = globalOf(re);
  g.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = g.exec(raw)) !== null) {
    if (!matchIsMention(raw, m.index)) return m;
    // A zero-length match would spin here forever. Patterns cannot produce one today; the
    // guard costs nothing and this file has already shipped one infinite-loop class of bug.
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return null;
}

/** Collapse whitespace, redact, and clip — evidence quotable without being a wall of text. */
function snippet(s: string, n = 160): string {
  return redact(s.replace(/\s+/g, ' ').trim()).slice(0, n);
}

/**
 * Extract obstacles from the failure text of a session.
 *
 * Takes already-extracted tool-result strings rather than raw records, so the caller owns
 * transcript shape and this stays testable with plain strings.
 */
export function extractObstacles(toolResults: string[], source = ''): Obstacle[] {
  const found = new Map<string, Obstacle>();

  for (let i = 0; i < toolResults.length; i++) {
    const raw = toolResults[i];
    if (!raw) continue;
    // Our own printout is not a failure. See isOwnReport -- without this the count ratchets.
    if (isOwnReport(raw)) continue;
    for (const p of PATTERNS) {
      // Not `p.re.exec`: a comment ABOUT the failure must not consume the result and hide a
      // real failure further down it. See firstRealMatch.
      const m = firstRealMatch(p.re, raw);
      if (!m) continue;
      // NORMALISE BEFORE HASHING. A tool result that arrived as JSON has its backslashes
      // doubled, so `C:\\dev\\sk_probe.js` and `C:\\\\dev\\\\sk_probe.js` are the same file and
      // hashed to two different obstacles. Patrik's run listed eight such pairs — the
      // "same wall collapses to one signature" property, failing on the first real input.
      const captured = normaliseCapture(m[1] ?? '');
      const signature = p.signature.replace('$1', captured);
      const id = obstacleId(signature);
      // Identify the OCCURRENCE, not the run: which corpus, which result, which wall. Stable
      // across re-scans of the same transcripts, distinct across genuinely new failures.
      const occurrence = obstacleId(`${source}|${i}|${signature}`);
      const existing = found.get(id);
      if (existing) {
        if (!existing.seen.includes(occurrence)) {
          existing.seen.push(occurrence);
          existing.hits++;
        }
      } else {
        found.set(id, {
          id,
          kind: p.kind,
          signature,
          hits: 1,
          seen: [occurrence],
          evidence: snippet(raw.slice(Math.max(0, m.index - 40))),
          resolution: p.observedFix,
          confidence: p.observedFix ? 'observed' : 'unverified',
        });
      }
      // First match wins. Patterns are ordered specific-first precisely so a blocked host is
      // not also filed as a generic 401, which would point at rotating a working credential.
      break;
    }
  }

  // Most-hit first: the wall walked into most often is the one worth reading first.
  return [...found.values()].sort((a, b) => b.hits - a.hits || a.signature.localeCompare(b.signature));
}

/**
 * Merge a new reading into what the project already knew, keeping the running total.
 *
 * Hits accumulate across sessions on purpose. "This blocked you 12 times" is an argument;
 * "this blocked you once, in a session you have forgotten" is not.
 */
export function mergeObstacles(prior: Obstacle[], next: Obstacle[]): Obstacle[] {
  const by = new Map(prior.map((o) => [o.id, { ...o }]));
  for (const o of next) {
    const existing = by.get(o.id);
    if (!existing) {
      by.set(o.id, { ...o });
      continue;
    }
    // Union of occurrences, not a sum of counts. Re-scanning the same sessions must be a
    // no-op; only a genuinely new failure moves the number.
    for (const f of o.seen) {
      if (!existing.seen.includes(f)) existing.seen.push(f);
    }
    existing.hits = existing.seen.length;
    // A remedy that has been OBSERVED to work outranks one that has not. Never downgrade.
    if (o.confidence === 'observed' && existing.confidence !== 'observed') {
      existing.resolution = o.resolution;
      existing.confidence = 'observed';
    }
  }
  return [...by.values()].sort((a, b) => b.hits - a.hits || a.signature.localeCompare(b.signature));
}

/**
 * The brief that gets reinjected — what this project already knows will block you.
 *
 * Deliberately short. This is meant to be pasted into a session's context at the start, and a
 * long one will be skimmed exactly like the CLAUDE.md it is supposed to reinforce. Only walls
 * hit more than once earn a place: a one-off is noise, a repeat is a pattern.
 */
export function toBrief(obstacles: Obstacle[], minHits = 2): string {
  const worth = obstacles.filter((o) => o.hits >= minHits);
  if (!worth.length) return '';
  const lines = ['## Known obstacles in this project', ''];
  lines.push('Learned from what actually failed here, not from anyone writing them down.', '');
  for (const o of worth) {
    lines.push(`- **${o.signature}** — hit ${o.hits}×`);
    lines.push(
      o.resolution
        ? `  ${o.confidence === 'observed' ? 'Observed to work' : 'UNVERIFIED — not seen to work'}: ${o.resolution}`
        : '  No remedy has been observed yet. Treat a guess as a guess.'
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Pull the failure text out of transcript records.
 *
 * Kept here rather than in the CLI so the transcript shape is covered by tests. Both shapes
 * carry tool output and both are needed: `tool_result` blocks in the message content, and the
 * `toolUseResult` sidecar the harness writes for some tools.
 */
export function toolResultsFromRecords(
  records: { message?: { content?: unknown }; toolUseResult?: unknown }[]
): string[] {
  const out: string[] = [];
  for (const r of records) {
    const c = r.message?.content;
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b && typeof b === 'object' && (b as { type?: string }).type === 'tool_result') {
          const v = (b as { content?: unknown }).content;
          out.push(typeof v === 'string' ? v : JSON.stringify(v));
        }
      }
    }
    if (r.toolUseResult !== undefined) out.push(JSON.stringify(r.toolUseResult).slice(0, 4000));
  }
  return out;
}

/**
 * ── COVERAGE: when is a NEGATIVE result from this scan worth anything? ──────────────────
 *
 * Found 2026-08-18 by the obstacle sweep reproducing its own step 1. In a scheduled cloud
 * container the only transcript on disk is the run's OWN — one file, one sessionId, the
 * session doing the scanning. Over that corpus the two learning commands disagreed:
 *
 *     enforcee learn <file>              → exit 2, "no human turns this build can read"
 *     enforcee obstacles <that dir>      → exit 0, "32 tool results across 1 session(s)"
 *                                                  "Nothing recognised blocked this project.
 *                                                   That is a real answer."
 *
 * One binary, one corpus, two contradictory answers, and the confident one is the false
 * negative. `learn` had been hardened against this exact provenance defect on 08-16;
 * `obstacles` never was, because the two commands read the same files for different reasons
 * and nothing held the coverage rule in one place. So: this is that place.
 *
 * The distinction that matters is between the two halves of the report:
 *
 *   - **Obstacles found are always real.** They come from tool results — a 403 in the run's
 *     own transcript is still a 403. Provenance does not weaken a positive.
 *   - **"Nothing blocked you" is only real if something was read that records the person's
 *     work.** Charter honesty rule 2: absence of a violation is weaker evidence than
 *     presence of one, and we say which we have.
 *
 * A transcript with no human turns is a machine talking to itself. That is a legitimate
 * thing to scan for failures and an illegitimate thing to conclude cleanliness from.
 *
 * ── Why this is not tightened until it accuses nobody ──
 *
 * The reverse failure is refusing a legitimate corpus. Two shapes had to keep working:
 *
 *   1. A real session — the person typed something — reports clean normally.
 *   2. A REPEAT run where every file was skipped as unchanged still reports clean, because
 *      the coverage fact was already established over those same files and is carried in the
 *      store. Re-deriving it would mean re-reading everything, which is the whole cost the
 *      incremental pass exists to avoid.
 *
 * Both are asserted in `tests/silent-skip.test.ts`, alongside the case that must fire.
 */
export interface CorpusCoverage {
  /** Transcripts actually READ this run. A skipped file was not read. */
  filesRead: number;
  /** Tool results read. Obstacles can only ever come from these. */
  toolResults: number;
  /** Of the files read, how many carried a turn the person themselves typed. */
  filesWithHumanTurns: number;
  /**
   * Whether an EARLIER run over this same store established that the corpus records human
   * work. Lets an all-skipped refresh stay quiet without re-reading megabytes.
   */
  humanCorpusPreviously: boolean;
}

/**
 * True when this corpus records some human's work, and a clean result therefore means the
 * project is clean rather than that the scan was looking at its own reflection.
 */
export function corpusRecordsHumanWork(c: CorpusCoverage): boolean {
  return c.filesWithHumanTurns > 0 || c.humanCorpusPreviously;
}

/**
 * May this scan report "nothing blocked this project" as a finding?
 *
 * Only about the NEGATIVE. Positives are reportable whatever the provenance.
 */
export function negativeIsReportable(c: CorpusCoverage): boolean {
  // Nothing read this run and nothing established before it: there is no corpus at all.
  if (c.filesRead === 0 && !c.humanCorpusPreviously) return false;
  // Files read but empty of tool results — obstacles could not have been found either way.
  if (c.filesRead > 0 && c.toolResults === 0) return false;
  return corpusRecordsHumanWork(c);
}

/** Why the negative was withheld, in the words the user needs. Empty when it is reportable. */
export function whyNegativeWithheld(c: CorpusCoverage): string {
  if (negativeIsReportable(c)) return '';
  if (c.filesRead === 0) return 'No transcript was read this run, so nothing was checked.';
  if (c.toolResults === 0) return `No tool results in the ${c.filesRead} transcript(s) read, so nothing was checked.`;
  return (
    `The ${c.filesRead} transcript(s) read contain no turn a person typed — they are a machine ` +
    `talking to itself, which is what a scheduled or agent-only session looks like on disk.`
  );
}
