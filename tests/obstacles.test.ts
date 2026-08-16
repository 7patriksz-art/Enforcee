import { describe, it, expect } from 'vitest';
import { extractObstacles, mergeObstacles, toBrief, obstacleId, redact } from '@/lib/prevent/obstacles';

/**
 * Obstacles are the half of learning that needs no user.
 *
 * Patrik, 2026-08-16: *"Enforcee should learn these itself from actions and actual in-flight
 * coding sessions, not me pointing at every error."*
 *
 * Measured over two real transcripts of this project (787 records, 406 tool results):
 * 78 results carried a prerequisite failure, and **48 of 48 recognised failures were a
 * signature already seen in the same history**. One hundred percent. Four separate pushes
 * died on `could not read Username`, with the remedy written in our own charter throughout.
 *
 * These tests pin the three properties that make that measurement useful rather than
 * decorative: the same wall must collapse to one signature, the count must survive across
 * sessions, and a remedy nobody has watched succeed must never be printed as the answer.
 */

describe('the same wall collapses to one signature', () => {
  it('counts repeats of one failure rather than filing them separately', () => {
    // Three different pushes, three different byte-for-byte messages, one wall.
    const out = extractObstacles([
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      "remote: ok\nfatal: could not read Username for 'https://github.com': terminal prompts disabled",
      "fatal: could not read Username for 'https://github.com': No such device or address",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].hits, 'repeats were filed as separate obstacles').toBe(3);
    expect(out[0].signature).toContain('https://github.com');
  });

  it('keeps different hosts apart', () => {
    const out = extractObstacles([
      'Host not in allowlist: api.supabase.com. Add this host to your network egress settings.',
      'Host not in allowlist: enforcee.com. Add this host to your network egress settings.',
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.signature).sort()).toEqual(['egress blocks api.supabase.com', 'egress blocks enforcee.com']);
  });

  it('gives a signature the same id every time, so it survives a new session', () => {
    expect(obstacleId('egress blocks api.supabase.com')).toBe(obstacleId('egress blocks api.supabase.com'));
    expect(obstacleId('egress blocks api.supabase.com')).not.toBe(obstacleId('egress blocks enforcee.com'));
  });
});

describe('a blocked host is not a bad credential', () => {
  it('files a gateway denial as network, not as a rejected token', () => {
    // The real one, 2026-08-16. `api.supabase.com` returned HTTP/2 403 with
    // `x-deny-reason: host_not_allowed`. Read as a permissions failure it says "rotate your
    // token" — sending someone to replace a credential that works, for a problem no
    // credential can fix. It nearly happened; the specific pattern must win over the generic.
    const out = extractObstacles([
      'HTTP/2 403 \nx-deny-reason: host_not_allowed\nHost not in allowlist: api.supabase.com.',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind, 'a blocked host was blamed on the credential').toBe('network');
    expect(out[0].resolution, 'it must not suggest the proxy bypass — that was tested and does not help').not.toMatch(
      /env -u https_proxy/
    );
  });

  it('still recognises a genuine 401 as a credential problem', () => {
    const out = extractObstacles(['{"status":401,"message":"Bad credentials"}']);
    expect(out[0].kind).toBe('credential');
  });
});

describe('a remedy nobody has run is never presented as the answer', () => {
  it('marks an unresolved obstacle unverified and says so in the brief', () => {
    const out = extractObstacles(["Error: Cannot find module '/home/claude/enforcee/dist/cli.js'"]);
    expect(out[0].confidence).toBe('unverified');
    expect(out[0].resolution).toBeUndefined();
    const brief = toBrief([{ ...out[0], hits: 3 }]);
    expect(brief, 'an unfixed obstacle is being presented as solved').toMatch(/No remedy has been observed/);
  });

  it('never invents a fix for a pattern that has none', () => {
    // This project has twice paid for a guessed remedy: an invented Resend settings screen,
    // and an error message's own suggested fix that did not exist. Every resolution shipped
    // here must be something this repo watched succeed.
    for (const o of extractObstacles(['npm error could not determine executable to run'])) {
      expect(o.resolution === undefined || o.confidence === 'observed').toBe(true);
    }
  });
});

describe('counts accumulate across sessions', () => {
  it('adds hits rather than overwriting them', () => {
    // "This blocked you 12 times" is an argument. "Once, in a session you have forgotten"
    // is not. The number only means something if it survives the session ending.
    const monday = extractObstacles(['Host not in allowlist: api.supabase.com.']);
    const tuesday = extractObstacles([
      'Host not in allowlist: api.supabase.com.',
      'Host not in allowlist: api.supabase.com.',
    ]);
    const merged = mergeObstacles(monday, tuesday);
    expect(merged).toHaveLength(1);
    expect(merged[0].hits).toBe(3);
  });

  it('never downgrades an observed remedy back to a guess', () => {
    const known = extractObstacles(['fatal: could not read Username for \'https://github.com\'']);
    expect(known[0].confidence).toBe('observed');
    const merged = mergeObstacles(known, [{ ...known[0], resolution: undefined, confidence: 'unverified' as const }]);
    expect(merged[0].confidence, 'a known-good remedy was replaced by a guess').toBe('observed');
  });
});

describe('the brief is short enough to actually be read', () => {
  const many = extractObstacles([
    'Host not in allowlist: api.supabase.com.',
    'Host not in allowlist: api.supabase.com.',
    "fatal: could not read Username for 'https://github.com'",
    'a one-off: command not found',
  ]);

  it('drops one-offs and keeps repeats', () => {
    const brief = toBrief(many);
    expect(brief).toContain('api.supabase.com');
    expect(brief, 'a single occurrence is noise, not a pattern').not.toMatch(/binary is not on PATH/);
  });

  it('is empty when there is nothing worth saying, rather than emitting a header', () => {
    // An empty section with a confident heading is how a reinjected brief becomes furniture
    // that gets skimmed. Nothing to say must look like nothing.
    expect(toBrief(extractObstacles(['a one-off: command not found']))).toBe('');
    expect(toBrief([])).toBe('');
  });
});

describe('a shared obstacle file leaks no secret', () => {
  // Evidence is a verbatim slice of a FAILURE, and failures are exactly where credentials
  // surface: an auth header echoed back, a token in a remote URL, a key in a rejected body.
  // `.enforcee/obstacles.json` is meant to be pasted into an issue or handed over for support
  // — Patrik is about to run this over his own machine's history and send me the result. A
  // token surviving that trip is a secret leaked BY the tool that exists to make things safer.
  //
  // Charter: never commit a secret, a token or a licence key.
  const CASES: [string, RegExp][] = [
    // The real shape, taken from this project's own push failures: git quotes the URL, and
    // the URL carries the token when pushing to an explicit remote. Written without the
    // quotes first, this case matched no pattern at all and asserted nothing — a test that
    // could not fail. The `expect(out.length).toBeGreaterThan(0)` guard below is what caught it.
    ["fatal: could not read Username for 'https://x-access-token:github_pat_11ABCDEFGHIJKLMNOPQRSTUV@github.com'", /github_pat_11AB/],
    ['401 {"error":"bad token sbp_abcdefghijklmnopqrstuvwxyz"}', /sbp_abcdef/],
    ['401 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0', /eyJhbGciOiJ/],
    ["fatal: could not read Username for 'https://user:hunter2supersecret@github.com'", /hunter2supersecret/],
    ['401 Unauthorized — Authorization: Bearer sk-proj-abcdefghijklmnopqrstuv', /sk-proj-abcdef/],
  ];

  for (const [raw, leak] of CASES) {
    it(`redacts: ${raw.slice(0, 42)}…`, () => {
      const out = extractObstacles([raw]);
      expect(out.length, 'the case did not even match a pattern — it proves nothing').toBeGreaterThan(0);
      expect(out[0].evidence, 'a secret survived into stored evidence').not.toMatch(leak);
    });
  }

  it('still keeps enough of the failure to be recognisable', () => {
    // Redaction that eats the whole message makes the evidence useless, which is the obvious
    // way to pass the tests above while destroying the feature.
    const out = extractObstacles([
      "fatal: could not read Username for 'https://x-access-token:github_pat_11ABCDEFGHIJKLMNOP@github.com'",
    ]);
    expect(out[0].evidence).toMatch(/could not read Username/);
    expect(out[0].evidence).toMatch(/github\.com/);
  });
});
