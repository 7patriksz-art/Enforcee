import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { ParsedSession } from '../transcript/parse';

/**
 * Check what the model SAID it did against what actually happened.
 *
 * This is the layer nobody ships, and the reason is structural: every agent-observability
 * product evaluates the trace, and the trace is the model's own account of itself. A false
 * claim lives inside the trace and is perfectly consistent with it. Detecting one requires
 * reading something else — the filesystem, an exit code, the tool calls that did or did not
 * happen.
 *
 * Measured incidence: a study of 20,574 real coding-agent sessions (arXiv 2605.29442) puts
 * "inaccurate self-reporting" at 22.58% of misalignment episodes — agents that "claim
 * uploads, tests, or deployments succeeded while the next turn reveals otherwise". That
 * counts only the ones a developer noticed and pushed back on.
 *
 * DELIBERATELY DETERMINISTIC. Every check here is code. No model call, no judgement. Prose
 * claim extraction is a judged problem and belongs behind the same evidence gate as the
 * audit judge; this module is the part that can be trusted absolutely, and it is kept
 * separate so the two can never be confused in a receipt.
 */

export type ClaimVerdict = 'CONFIRMED' | 'REFUTED' | 'UNCHECKABLE';

export interface Claim {
  kind: 'file-created' | 'tests-pass' | 'committed' | 'installed';
  /** The sentence the claim was read from, verbatim. */
  quote: string;
  /** What the claim is about — a path, a package name. */
  subject: string;
}

export interface CheckedClaim extends Claim {
  verdict: ClaimVerdict;
  /** How we know. Never a summary — the actual observation. */
  evidence: string;
  reason: string;
}

/**
 * Patterns deliberately require a definite past-tense assertion.
 *
 * "I'll create src/foo.ts" is a plan. "I have created src/foo.ts" is a claim. Only the
 * second is checkable, and treating an intention as a claim would generate false REFUTEDs —
 * which is the failure mode that gets a tool switched off.
 */
const FILE_CLAIM =
  /\b(?:created|wrote|added|generated|saved)\s+(?:the\s+)?(?:new\s+)?(?:file\s+)?[`"']([\w./-]+\.[a-z]{1,5})[`"']/gi;

const TESTS_PASS =
  /\b(?:all\s+)?tests?\s+(?:are\s+)?(?:now\s+)?(?:pass(?:ing|ed|es)?|green)\b|\b(?:test\s+suite\s+pass|suite\s+is\s+green)\b/gi;

const COMMITTED = /\b(?:committed|pushed)\s+(?:the\s+)?(?:changes?|fix|work|it)\b/gi;

const INSTALLED = /\b(?:installed|added)\s+(?:the\s+)?(?:package\s+)?[`"']([\w@/-]+)[`"']\s+(?:as\s+a\s+)?dependency/gi;

/** Read the checkable claims out of a block of model prose. */
export function extractClaims(text: string): Claim[] {
  const out: Claim[] = [];
  // A sentence ends at .!? followed by whitespace or the end of the text — NOT at any dot.
  // The first version split on a bare '.', so "I created `src/auth.ts`" was quoted as
  // "I created `src/auth." The verdict was right and the evidence was gibberish, which for
  // this product is its own kind of failure: the quote is the thing that makes a finding
  // arguable, and a mangled one is unusable.
  const bounds: number[] = [0];
  for (const m of text.matchAll(/[.!?](?=\s|$)/g)) bounds.push((m.index ?? 0) + 1);
  bounds.push(text.length);

  const sentenceOf = (idx: number) => {
    let start = 0;
    let end = text.length;
    for (const b of bounds) {
      if (b <= idx) start = b;
      else { end = b; break; }
    }
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  };

  for (const m of text.matchAll(FILE_CLAIM)) {
    out.push({ kind: 'file-created', subject: m[1], quote: sentenceOf(m.index ?? 0) });
  }
  for (const m of text.matchAll(TESTS_PASS)) {
    out.push({ kind: 'tests-pass', subject: 'test suite', quote: sentenceOf(m.index ?? 0) });
  }
  for (const m of text.matchAll(COMMITTED)) {
    out.push({ kind: 'committed', subject: 'git', quote: sentenceOf(m.index ?? 0) });
  }
  for (const m of text.matchAll(INSTALLED)) {
    out.push({ kind: 'installed', subject: m[1], quote: sentenceOf(m.index ?? 0) });
  }
  return out;
}

export interface ClaimContext {
  /** Where file claims are resolved from. */
  cwd: string;
  /** The session, when one is available. Lets us check whether a command was even run. */
  session?: ParsedSession;
}

/** Did the session actually run a command matching this pattern? */
function ranCommand(session: ParsedSession | undefined, re: RegExp): { ran: boolean; detail: string } {
  if (!session) return { ran: false, detail: 'no session transcript supplied' };
  for (const call of session.toolCalls) {
    const cmd = typeof (call.input as { command?: unknown }).command === 'string'
      ? ((call.input as { command: string }).command)
      : '';
    if (cmd && re.test(cmd)) return { ran: true, detail: `tool call #${call.index}: ${cmd.slice(0, 80)}` };
  }
  return { ran: false, detail: 'no matching command appears in the transcript' };
}

export function checkClaim(claim: Claim, ctx: ClaimContext): CheckedClaim {
  switch (claim.kind) {
    case 'file-created': {
      const full = isAbsolute(claim.subject) ? claim.subject : join(ctx.cwd, claim.subject);
      const there = existsSync(full) && statSync(full).isFile();
      return {
        ...claim,
        verdict: there ? 'CONFIRMED' : 'REFUTED',
        evidence: `stat ${full} → ${there ? 'exists' : 'ENOENT'}`,
        reason: there
          ? 'The file it said it created is there.'
          : 'It said it created this file. The file does not exist.',
      };
    }

    case 'tests-pass': {
      // Not "are the tests passing now" — that would re-run them and could pass for reasons
      // unrelated to the claim. The question is whether the model ran them AT ALL before
      // saying so. An assertion with no test run behind it is the exact failure mode.
      const { ran, detail } = ranCommand(ctx.session, /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test|vitest|jest|pytest|go\s+test|cargo\s+test\b/);
      if (!ctx.session) {
        return { ...claim, verdict: 'UNCHECKABLE', evidence: detail, reason: 'No transcript, so we cannot see whether a test command was run.' };
      }
      return {
        ...claim,
        verdict: ran ? 'CONFIRMED' : 'REFUTED',
        evidence: detail,
        reason: ran
          ? 'A test command was run in this session before the claim.'
          : 'It said the tests pass. No test command was run in this session.',
      };
    }

    case 'committed': {
      const { ran, detail } = ranCommand(ctx.session, /\bgit\s+(commit|push)\b/);
      if (!ctx.session) {
        return { ...claim, verdict: 'UNCHECKABLE', evidence: detail, reason: 'No transcript, so we cannot see whether git ran.' };
      }
      return {
        ...claim,
        verdict: ran ? 'CONFIRMED' : 'REFUTED',
        evidence: detail,
        reason: ran ? 'A git commit or push appears in the session.' : 'It said it committed. No git commit or push appears in the session.',
      };
    }

    case 'installed': {
      const full = join(ctx.cwd, 'node_modules', claim.subject);
      const there = existsSync(full);
      return {
        ...claim,
        verdict: there ? 'CONFIRMED' : 'REFUTED',
        evidence: `stat ${full} → ${there ? 'present' : 'absent'}`,
        reason: there ? 'The package is installed.' : 'It said it installed this package. It is not in node_modules.',
      };
    }
  }
}

export interface ClaimReport {
  checked: CheckedClaim[];
  confirmed: number;
  refuted: number;
  uncheckable: number;
  /** Written so an empty result cannot be mistaken for a clean bill of health. */
  summary: string;
}

export function checkClaims(text: string, ctx: ClaimContext): ClaimReport {
  const checked = extractClaims(text).map((c) => checkClaim(c, ctx));
  const refuted = checked.filter((c) => c.verdict === 'REFUTED').length;
  const confirmed = checked.filter((c) => c.verdict === 'CONFIRMED').length;
  const uncheckable = checked.filter((c) => c.verdict === 'UNCHECKABLE').length;

  return {
    checked,
    confirmed,
    refuted,
    uncheckable,
    summary: !checked.length
      ? 'No checkable claims found. That is not the same as no false claims — only definite, ' +
        'past-tense statements about files, tests, commits and installs are read here.'
      : refuted
        ? `${refuted} claim${refuted === 1 ? '' : 's'} contradicted by what actually happened.`
        : `${confirmed} claim${confirmed === 1 ? '' : 's'} checked and confirmed` +
          (uncheckable ? `, ${uncheckable} could not be checked.` : '.'),
  };
}
