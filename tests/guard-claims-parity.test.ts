import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkClaims } from '../src/lib/prevent/claims';
import { parseTranscript } from '../src/lib/transcript/parse';

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
  execFileSync(process.execPath, [new URL('../guard/guard.mjs', import.meta.url).pathname], {
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
];

describe('guard.mjs and src/lib agree on every claim', () => {
  for (const [name, f] of CASES) {
    it(name, () => {
      expect(guardVerdicts(f)).toEqual(libVerdicts(f));
    });
  }
});
