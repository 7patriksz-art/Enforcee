/**
 * THE RULES FOR "DOES THIS DIFF CARRY A CREDENTIAL?" — one copy, in src/ where the tests can
 * reach it on every platform.
 *
 * THIS REPOSITORY IS PUBLIC. From 2026-08-17 four scheduled jobs carry a real GitHub PAT in
 * their prompt so they can push their own work instead of stranding it in a project doc —
 * product engine (04:00), engine improvement (08:00), obstacle sweep (10:00) and the CLOSER
 * (12:00). Before that a leaked token was not reachable from a scheduled run, because a
 * scheduled run had no credential. Now it is: an autonomous job doing `git add -A` over a
 * scratch file containing its own token writes a live push credential into a public repo, and
 * the first thing that credential can do is push.
 *
 * `src/lib/prevent/obstacles.ts` has redacted these shapes since 2026-08-16 — but only when
 * PRINTING a report. A display filter cannot stop a commit, and nothing in the push path
 * looked at all. `scripts/secret-gate.mjs` is the CLI over these rules and `scripts/push.sh`
 * runs it before every push, outside the SKIP_CHECKS branch.
 *
 * TWO LAYERS, because each catches what the other cannot:
 *
 *   1. EXACT MATCH on the credential actually in hand. If $PAT is set, the literal string is
 *      searched for in the outgoing diff. Zero false positives by construction, and the only
 *      check guaranteed to catch THE token this machine holds, whatever shape a future
 *      provider invents. Never exempt, in any file.
 *
 *   2. SHAPE MATCH with a realistic length floor. Catches other people's tokens and other
 *      providers. The floor is what makes it usable: `tests/obstacles.test.ts` legitimately
 *      contains `github_pat_11ABCDEFGHIJKLMNOPQRSTUV` as a FIXTURE, and a naive
 *      /github_pat_\w+/ would refuse every push on this repo forever. A control that cries
 *      wolf gets switched off, which is worse than no control.
 *
 * WHY src/ AND NOT scripts/. The first version put these rules in `scripts/secret-gate.mjs`
 * and imported them straight from the test. `tests/portability.test.ts` refused it within the
 * hour — that is the shape that threw `SyntaxError` on windows-latest earlier the same day.
 * The rule caught its own author, which is the entire point of writing it down as a test.
 */

import { execFileSync } from 'node:child_process';

export type Shape = { name: string; re: RegExp };
export type Hit = { what: string; masked: string; file: string };

/**
 * Each entry: what it is, how to spot it, and the shortest REAL example. The floor is set
 * from the real format so that documentation and test fixtures — which are always shorter,
 * or obviously sequential — do not trip it.
 */
export const CREDENTIAL_SHAPES: Shape[] = [
  {
    name: 'GitHub fine-grained PAT',
    // Real: `github_pat_` + 82 chars = 93 total. The repo's own fixture is 35 total.
    re: /github_pat_[A-Za-z0-9_]{60,}/g,
  },
  {
    name: 'GitHub classic token',
    // ghp_/gho_/ghu_/ghs_/ghr_ + exactly 36. Docs write `ghp_...`, which is far below this.
    re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: 'Anthropic API key',
    re: /\bsk-ant-[A-Za-z0-9_-]{30,}/g,
  },
  {
    name: 'OpenAI API key',
    re: /\bsk-[A-Za-z0-9]{40,}\b/g,
  },
  {
    name: 'Supabase service key',
    re: /\bsbp_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: 'Vercel token',
    re: /\bvcp_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: 'PEM private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: 'credential in a URL',
    // https://user:secret@host — the shape that put a real endpoint into the bundle once.
    re: /https?:\/\/[^/\s:@]+:[^/\s:@]{8,}@[^/\s]+/g,
  },
];

/**
 * Files allowed to contain a credential SHAPE, because their job is to recognise one.
 * A closed, named set — `tests/secret-gate.test.ts` asserts it stays that size, so widening
 * it is an argued decision rather than a one-line edit that turns the gate off for a file.
 *
 * This exemption applies to layer 2 ONLY. Layer 1 — the literal credential this machine is
 * holding — is never exempt anywhere, because there is no file in this repository that has
 * a reason to contain the live token.
 */
export const SHAPE_EXEMPT_FILES: string[] = [
  'tests/obstacles.test.ts', // fixtures: the redactor must be shown real-looking input
  'tests/secret-gate.test.ts', // this gate's own tests
  'src/lib/prevent/obstacles.ts', // the redactor, which has to quote what it redacts
  'src/lib/secret-gate.ts', // this file: the rules must quote what they ban
  'scripts/push.sh', // documents its own usage as `PAT=github_pat_...`
];

/**
 * Split `git log -p` output into `[path, body]` pairs so a hit can be attributed to a file.
 * Anything before the first `+++ b/…` (commit headers, messages) is attributed to `''`, which
 * is never exempt — a token pasted into a commit message is still a token in a public repo.
 */
export function byFile(diff: string): [string, string][] {
  const out: [string, string][] = [];
  let path = '';
  let buf: string[] = [];
  for (const line of diff.split('\n')) {
    const m = /^\+\+\+ b\/(.+)$/.exec(line);
    if (m) {
      out.push([path, buf.join('\n')]);
      path = m[1].trim();
      buf = [];
    } else buf.push(line);
  }
  out.push([path, buf.join('\n')]);
  return out;
}

/** Redact a hit so the gate's own error message cannot become the leak. */
export function mask(hit: string): string {
  if (hit.length <= 12) return `${hit.slice(0, 4)}…`;
  return `${hit.slice(0, 8)}…${hit.slice(-4)} (${hit.length} chars)`;
}

/**
 * Scan `text` for credentials. `literal` is the exact credential in hand, if any.
 * `file` is the path the text came from, used only for the layer-2 exemption.
 * Returns `[{ what, masked, file }]` — empty means clean.
 */
export function findCredentials(text: string, literal?: string, file = ''): Hit[] {
  const hits: Hit[] = [];
  // Layer 1: the exact thing this machine is holding. Guaranteed catch, no false positives,
  // NEVER exempt — no file in this repo has a reason to contain the live token.
  // Guarded on length so an empty or placeholder $PAT cannot match every line in the diff.
  if (literal && literal.length >= 20 && text.includes(literal)) {
    hits.push({ what: 'THE CREDENTIAL THIS MACHINE IS HOLDING ($PAT)', masked: mask(literal), file });
  }
  // Layer 2: shapes, with a realistic floor so fixtures and docs do not trip it, and a
  // closed exempt list for the files whose job is to recognise a credential.
  if (SHAPE_EXEMPT_FILES.includes(file)) return hits;
  for (const { name, re } of CREDENTIAL_SHAPES) {
    for (const m of text.matchAll(re)) {
      if (literal && m[0] === literal) continue; // already reported, more precisely, above
      hits.push({ what: name, masked: mask(m[0]), file });
    }
  }
  return hits;
}

/** Scan a whole `git log -p` diff, attributing each hit to the file it landed in. */
export function findInDiff(diff: string, literal?: string): Hit[] {
  return byFile(diff).flatMap(([path, body]) => findCredentials(body, literal, path));
}

/**
 * The commits that would be pushed. Throws rather than returning '' when the range cannot be
 * read — a checker that silently covers nothing is this project's single most repeated defect,
 * and here it would mean printing "clean" and pushing anyway.
 */
export function outgoingDiff(range?: string, cwd?: string): string {
  const resolved =
    range ||
    `origin/${execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', cwd }).trim()}..HEAD`;
  return execFileSync('git', ['log', '-p', '--no-color', resolved], {
    encoding: 'utf8',
    cwd,
    maxBuffer: 256 * 1024 * 1024,
  });
}
