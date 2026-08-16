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
export const PATTERNS_VERSION = 2;

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
    for (const p of PATTERNS) {
      const m = p.re.exec(raw);
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
