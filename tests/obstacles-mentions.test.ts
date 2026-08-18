import { describe, expect, it } from 'vitest';
import {
  extractObstacles,
  matchIsMention,
  isOwnReport,
  firstRealMatch,
  negativeIsReportable,
  corpusRecordsHumanWork,
  whyNegativeWithheld,
  type CorpusCoverage,
} from '@/lib/prevent/obstacles';

/**
 * The 2026-08-18 obstacle sweep pointed the product at its own container and watched it
 * produce, in one run, four separate untruths:
 *
 *   1. "Nothing recognised blocked this project. That is a real answer." — over a corpus that
 *      was exclusively the scanning session's own transcript, which `enforcee learn` refuses
 *      outright. One binary, one corpus, two contradictory answers.
 *   2. "HTTP 401 — the credential was rejected, hit 4x" — every hit a source COMMENT about the
 *      401 pattern, several of them the comment describing the last time this pattern
 *      false-accused somebody.
 *   3. The same, through `grep -n`, where the line number in front of `// ...` hid the marker.
 *   4. The same again, from the tool's own printed report captured as a tool result — the
 *      shape that ratchets, because every run re-files what the last run printed.
 *
 * Every test below is one of those, plus the case that must still fire. This project's stated
 * headline is zero false accusations; tightening until it accuses nobody is the same failure
 * upside down, so no guard here is allowed to land without its negative twin.
 */

const REAL_401 = 'HTTP/1.1 401 Unauthorized\nx-request-id: 9f2\n';
const RE_401 =
  /(?:HTTP[/ ]?[\d.]*\s*401\b|"?status"?[:\s]+401\b|\b401\s+(?:Unauthorized|Client Error)|code"?[:\s]+401\b|->\s*401\b|\bUnauthorized\b)/i;

describe('a mention of a failure is not a failure', () => {
  it('does not accuse a credential over a // comment about 401s', () => {
    const raw = '    // 401 pattern was tightened, every stored "HTTP 401" count became a number\n';
    expect(extractObstacles([raw])).toEqual([]);
  });

  it('does not accuse over a JSDoc continuation line', () => {
    const raw = ' * Twenty times an HTTP 401 came back from a credential already shown not to work.\n';
    expect(extractObstacles([raw])).toEqual([]);
  });

  it('sees the marker through a JSON-encoded newline, which is how tool results actually arrive', () => {
    // toolResultsFromRecords stores the toolUseResult sidecar as JSON.stringify(...), so a
    // whole file read is ONE physical line with every break as the two characters \ and n.
    // The first version of this guard looked for real newlines only and changed nothing.
    const raw = 'some preamble\\n    // a comment about HTTP 401 handling\\nmore text';
    expect(extractObstacles([raw])).toEqual([]);
  });

  it('sees the marker through a grep -n line-number prefix', () => {
    expect(extractObstacles(['166:    // MUST require HTTP context, or bare 401 Unauthorized matches\n'])).toEqual([]);
    expect(extractObstacles(['src/auth.ts:88: * returns HTTP 401 when the token has expired\n'])).toEqual([]);
  });

  it('does not accuse over a markdown or shell # comment', () => {
    expect(extractObstacles(['# Handling HTTP 401 responses\n'])).toEqual([]);
    expect(extractObstacles(['<!-- the API answers 401 Unauthorized here -->\n'])).toEqual([]);
  });

  // ── and now the other direction, which matters exactly as much ──────────────────────────

  it('still files a genuine 401', () => {
    const got = extractObstacles([REAL_401]);
    expect(got).toHaveLength(1);
    expect(got[0].signature).toMatch(/401/);
    expect(got[0].kind).toBe('credential');
  });

  it('still files a genuine 401 that is indented, since indentation is not a comment', () => {
    expect(extractObstacles(['    {"status": 401, "message": "bad credentials"}\n'])).toHaveLength(1);
  });

  it('files a real failure that appears BELOW a comment about the same failure', () => {
    // The guard drops the MATCH, never the tool result. A file that discusses 401s and then
    // hits one must still report the one it hit.
    const raw = '// we handle HTTP 401 by refreshing\nrunning probe...\nHTTP/1.1 401 Unauthorized\n';
    const got = extractObstacles([raw]);
    expect(got, 'a real 401 under a comment about 401s was swallowed').toHaveLength(1);
    expect(got[0].evidence).not.toMatch(/we handle/);
  });

  it('does not treat an ordinary indented failure line as a comment', () => {
    expect(matchIsMention('    fatal: not a git repository\n', 4)).toBe(false);
  });

  it('leaves -, + and > alone: a diff line and a quoted line are not comments', () => {
    // Deliberate. A stack frame indented by a shell looks identical to a quoted line, and
    // guessing there is how a checker stops checking.
    expect(extractObstacles(['- HTTP/1.1 401 Unauthorized\n'])).toHaveLength(1);
    expect(extractObstacles(['> HTTP/1.1 401 Unauthorized\n'])).toHaveLength(1);
  });

  it('firstRealMatch steps past a mention to the event, and returns null when there is none', () => {
    const both = '// about HTTP 401\nHTTP/1.1 401 Unauthorized\n';
    expect(firstRealMatch(RE_401, both)?.index).toBeGreaterThan(both.indexOf('\n'));
    expect(firstRealMatch(RE_401, '// only a comment about HTTP 401 here\n')).toBeNull();
  });
});

describe('the tool must not read its own report', () => {
  it('skips the console report it printed a moment ago', () => {
    const printed =
      '\n  114 tool results across 1 session(s)\n\n  4x    HTTP 401 — the credential was rejected  credential\n' +
      '                 -> Test the token against an authenticated endpoint before using it.\n';
    expect(isOwnReport(printed)).toBe(true);
    expect(extractObstacles([printed]), 'the count ratchets on its own printout').toEqual([]);
  });

  it('skips the reinjection brief', () => {
    expect(isOwnReport('## Known obstacles in this project\n\n- **HTTP 401 — the credential was rejected** — hit 4x\n')).toBe(true);
  });

  it('skips the clean-result sentence, which is how a later scan would re-read it', () => {
    expect(isOwnReport('  Nothing recognised blocked this project. That is a real answer.\n')).toBe(true);
  });

  // ── the other direction ─────────────────────────────────────────────────────────────────

  it('does not skip a genuine failure that merely says the word obstacles', () => {
    const raw = 'obstacles.mjs: HTTP/1.1 401 Unauthorized while fetching the obstacle list\n';
    expect(isOwnReport(raw)).toBe(false);
    expect(extractObstacles([raw])).toHaveLength(1);
  });

  it('does not skip a failure that mentions sessions and tool results in passing', () => {
    // "12 tool results across 1 session" is ours; prose about sessions is not.
    expect(isOwnReport('failed to list sessions: HTTP/1.1 401 Unauthorized\n')).toBe(false);
  });
});

describe('a clean result needs a corpus that recorded somebody working', () => {
  const base: CorpusCoverage = { filesRead: 3, toolResults: 400, filesWithHumanTurns: 2, humanCorpusPreviously: false };

  it('reports clean over a real session', () => {
    expect(negativeIsReportable(base)).toBe(true);
    expect(whyNegativeWithheld(base)).toBe('');
  });

  it('refuses to report clean over transcripts with no human turn at all', () => {
    // The scheduled-container case, measured: one .jsonl, sessionId = the running session's,
    // 26 user-role records and zero human turns. `learn` exits 2 on exactly this file.
    const c = { ...base, filesRead: 1, toolResults: 32, filesWithHumanTurns: 0 };
    expect(negativeIsReportable(c)).toBe(false);
    expect(whyNegativeWithheld(c)).toMatch(/no turn a person typed/i);
  });

  it('refuses when nothing was read at all', () => {
    const c = { ...base, filesRead: 0, toolResults: 0, filesWithHumanTurns: 0 };
    expect(negativeIsReportable(c)).toBe(false);
    expect(whyNegativeWithheld(c)).toMatch(/nothing was checked/i);
  });

  it('refuses when files were read but held no tool results', () => {
    const c = { ...base, toolResults: 0, filesWithHumanTurns: 2 };
    expect(negativeIsReportable(c)).toBe(false);
    expect(whyNegativeWithheld(c)).toMatch(/no tool results/i);
  });

  it('stays quiet on a repeat run where every file was skipped as unchanged', () => {
    // The over-tightening this guard had to avoid: coverage was established over these same
    // files last run, and re-deriving it would mean re-reading everything the incremental
    // pass exists to skip.
    const c: CorpusCoverage = { filesRead: 0, toolResults: 0, filesWithHumanTurns: 0, humanCorpusPreviously: true };
    expect(corpusRecordsHumanWork(c)).toBe(true);
    expect(negativeIsReportable(c)).toBe(true);
  });

  it('a positive is reportable whatever the provenance — only the negative is gated', () => {
    // Obstacles come from tool results. A 403 in a machine-only transcript is still a 403.
    const got = extractObstacles([REAL_401]);
    expect(got).toHaveLength(1);
  });
});
