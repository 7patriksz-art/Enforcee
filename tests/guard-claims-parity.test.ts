import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkClaims } from '../src/lib/prevent/claims';
import { parseTranscript } from '../src/lib/transcript/parse';
import { fileURLToPath } from 'node:url';

/**
 * guard.mjs carries a SECOND implementation of the claim checks, and it has to: the guard is
 * standalone and dependency-free by design, so it can run as a hook on a machine that has
 * never installed anything. It cannot import from src/lib.
 *
 * That is the duplicated-source shape that has bitten this project eight times — the licence
 * key, the guard runner, the evidence-gate claim, version strings, the pricing matrix, the
 * plugin hook path, the CLI version, the lockfile.
 *
 * A byte-comparison would be the wrong control here, because the two are legitimately
 * different code. What matters is that they never disagree about an answer. So this runs the
 * same fixtures through both and asserts identical verdicts — behaviour parity, not text
 * parity. If they ever diverge, a user gets one story from the CLI and another from the hook,
 * which is worse than either being wrong on its own.
 */

function fixture(files: string[], commands: string[], prose: string) {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
  for (const f of files) writeFileSync(join(dir, f), 'x');

  const lines = [
    ...commands.map((command, i) =>
      JSON.stringify({ type: 'assistant', uuid: `c${i}`, parentUuid: i ? `c${i - 1}` : undefined, message: { content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command } }] } })
    ),
    JSON.stringify({ type: 'assistant', uuid: 'final', parentUuid: commands.length ? `c${commands.length - 1}` : undefined, message: { content: [{ type: 'text', text: prose }] } }),
  ];
  const transcript = join(dir, 'transcript.jsonl');
  writeFileSync(transcript, lines.join('\n') + '\n');
  return { dir, transcript, prose, commands };
}

function guardVerdicts(f: ReturnType<typeof fixture>): Record<string, string> {
  execFileSync(process.execPath, [fileURLToPath(new URL('../guard/guard.mjs', import.meta.url))], {
    input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: f.dir, transcript_path: f.transcript }),
    cwd: f.dir, encoding: 'utf8', env: { ...process.env, ENFORCEE_LICENCE: '' },
  });
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(f.dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n')) {
    const e = JSON.parse(line);
    if (e.decision === 'CLAIM') out[`${e.kind}:${e.subject}`] = e.verdict;
  }
  return out;
}

function libVerdicts(f: ReturnType<typeof fixture>): Record<string, string> {
  const session = parseTranscript(readFileSync(f.transcript, 'utf8'));
  const out: Record<string, string> = {};
  for (const c of checkClaims(f.prose, { cwd: f.dir, session }).checked) {
    out[`${c.kind}:${c.subject}`] = c.verdict;
  }
  return out;
}

const CASES: [string, ReturnType<typeof fixture>][] = [
  ['a file that was never created', fixture([], ['ls'], 'I created `src/auth.ts` for you.')],
  ['a file that exists', fixture(['auth.ts'], ['ls'], 'I created `auth.ts` for you.')],
  ['tests claimed, never run', fixture([], ['git status'], 'All tests pass.')],
  ['tests claimed and run', fixture([], ['npm test'], 'All tests pass.')],
  ['commit claimed, never made', fixture([], ['git diff'], 'I committed the changes.')],
  ['commit claimed and made', fixture([], ['git commit -m x'], 'I committed the changes.')],
  ['several claims at once', fixture([], ['ls'], 'I created `a.ts`. All tests pass. I committed the changes.')],
  ['nothing claimed', fixture([], ['ls'], 'That all looks fine to me.')],

  // Every case below is a divergence the eight fixtures above could not see, because they
  // were all linear, all assistant-authored, and all had a tool call in them. Each one was
  // a real disagreement: the guard said REFUTED where the library said UNCHECKABLE, or
  // said REFUTED where the library said nothing at all.
  ['a negated claim is not a claim', fixture([], ['ls'], 'I have not committed the changes yet.')],
  ['a conditional is not a claim', fixture([], ['ls'], 'If the tests pass, we can ship.')],
  ['telling the truth about a failure', fixture([], ['ls'], 'Not all tests pass yet — 3 failures remain.')],
  ['a request is not a claim', fixture([], ['ls'], 'Please run the suite and confirm all tests pass.')],
  ['make runs tests too', fixture([], ['make test'], 'All tests pass.')],
  ['so does mvn', fixture([], ['mvn -q verify test'], 'All tests pass.')],
  ['so does dotnet', fixture([], ['dotnet test'], 'All tests pass.')],
  ['so does a shell script', fixture([], ['./scripts/test.sh'], 'All tests pass.')],
  ['gh pr create counts as pushing', fixture([], ['gh pr create --fill'], 'I pushed the changes.')],
  ['a transcript with no tool calls answers nothing', fixture([], [], 'All tests pass. I committed the changes.')],
];

describe('guard.mjs and src/lib agree on every claim', () => {
  for (const [name, f] of CASES) {
    it(name, () => {
      expect(guardVerdicts(f)).toEqual(libVerdicts(f));
    });
  }
});

/**
 * Two properties the parity fixtures above structurally cannot express, because both are
 * about which records are read at all rather than which verdict is reached.
 */
describe('the guard reads the right records', () => {
  function raw(lines: object[]) {
    const dir = mkdtempSync(join(tmpdir(), 'guard-rec-'));
    mkdirSync(join(dir, '.enforcee'), { recursive: true });
    writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
    const transcript = join(dir, 't.jsonl');
    writeFileSync(transcript, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    execFileSync(process.execPath, [fileURLToPath(new URL('../guard/guard.mjs', import.meta.url))], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: dir, transcript_path: transcript }),
      cwd: dir, encoding: 'utf8', env: { ...process.env, ENFORCEE_LICENCE: '' },
    });
    return readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  }

  it('never puts the user on trial for their own words', () => {
    // The person types "all tests pass" — reporting back, asking, or quoting an error.
    // Attributing that to the model and refuting it accuses the user of lying to themselves.
    const rows = raw([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: [{ type: 'text', text: 'All tests pass. I committed the changes.' }] } },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] } },
    ]);
    expect(rows.filter((r) => r.decision === 'CLAIM')).toEqual([]);
  });

  it('ignores a branch the session rewound past', () => {
    // u1 has two children: the model's first attempt, abandoned, and the retry that
    // survived. The abandoned attempt ran the tests; the live one did not.
    const rows = raw([
      { type: 'user', uuid: 'u1', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } },
      { type: 'assistant', uuid: 'dead', parentUuid: 'u1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'd', name: 'Bash', input: { command: 'npm test' } }] } },
      { type: 'assistant', uuid: 'a1', parentUuid: 'u1', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] } },
      { type: 'assistant', uuid: 'a2', parentUuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'All tests pass.' }] } },
    ]);
    const claim = rows.find((r) => r.decision === 'CLAIM' && r.kind === 'tests-pass');
    expect(claim?.verdict).toBe('REFUTED');
  });

  it('says so in the ledger when it could not read the transcript at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-noread-'));
    mkdirSync(join(dir, '.enforcee'), { recursive: true });
    writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
    execFileSync(process.execPath, [fileURLToPath(new URL('../guard/guard.mjs', import.meta.url))], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: dir, transcript_path: join(dir, 'nope.jsonl') }),
      cwd: dir, encoding: 'utf8', env: { ...process.env, ENFORCEE_LICENCE: '' },
    });
    const rows = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const skipped = rows.find((r) => r.decision === 'CLAIM_SKIPPED');
    expect(skipped).toBeTruthy();
    expect(skipped.reason).toMatch(/unreadable|empty/);
  });
});
