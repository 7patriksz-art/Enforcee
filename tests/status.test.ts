import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * `enforcee status` exists because Patrik asked a question nothing could answer.
 *
 * 2026-08-16: *"Is enforcee truly installed here? Where can I access it and see its job?"*
 *
 * Enforcee had written a policy, a licence, a ledger and an obstacle store into `.enforcee/`
 * and offered no way to look at any of them. A tool whose entire pitch is "you cannot see
 * whether your rules are working" had shipped with exactly that problem.
 *
 * The load-bearing assertion here is the ABSENCE one. A project with hooks registered, a
 * policy compiled and a valid licence looks completely healthy — and if the guard has never
 * actually run, none of that configuration has been exercised and nothing is being enforced.
 * Those two states are indistinguishable unless the empty ledger is said out loud. This
 * project's single most repeated failure is a check that silently covered nothing; a status
 * screen that renders "all green" over an empty ledger would be that failure with a UI.
 */

const CLI = resolve(__dirname, '..', 'cli', 'dist', 'enforcee.mjs');
let project: string;

function status(cwd: string): { text: string; json: Record<string, unknown> } {
  const text = execFileSync('node', [CLI, 'status'], { cwd, encoding: 'utf8' });
  const raw = execFileSync('node', [CLI, 'status', '--json'], { cwd, encoding: 'utf8' });
  // Strip ANSI so assertions are about content, not colour.
  return { text: text.replace(/\x1b\[[0-9;]*m/g, ''), json: JSON.parse(raw) };
}

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'enforcee-status-'));
  mkdirSync(join(project, '.enforcee'), { recursive: true });
  mkdirSync(join(project, '.claude'), { recursive: true });
});
afterAll(() => rmSync(project, { recursive: true, force: true }));

describe('status tells you what has NOT happened', () => {
  it('says plainly when nothing is installed at all', () => {
    const { text, json } = status(project);
    expect(json.installed).toBe(false);
    expect(text).toMatch(/hooks/);
    expect(text, 'a bare project was not reported as uninstalled').toMatch(/not registered/);
  });

  it('reports an empty ledger as the finding, not as health', () => {
    // The case that matters. Everything configured, nothing ever run.
    writeFileSync(
      join(project, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'node guard/guard.mjs' }] }] } })
    );
    writeFileSync(
      join(project, '.enforcee', 'policy.json'),
      JSON.stringify({ deny: [{ id: 'a' }, { id: 'b' }], warn: [{ id: 'c' }], rulesetHash: 'abc123def456' })
    );
    const { text, json } = status(project);
    expect((json.ledger as { entries: number }).entries).toBe(0);
    expect(text, 'an unexercised install rendered as healthy').toMatch(/NO DECISIONS RECORDED/);
    expect(text).toMatch(/None of it has been exercised/);
  });

  it('counts real decisions once the guard has run', () => {
    writeFileSync(
      join(project, '.enforcee', 'ledger.jsonl'),
      [
        JSON.stringify({ at: '2026-08-16T13:26:21.053Z', decision: 'REINJECT', chars: 7749 }),
        JSON.stringify({ at: '2026-08-16T14:25:34.443Z', decision: 'REINJECT', chars: 4073 }),
        JSON.stringify({ at: '2026-08-16T14:30:00.000Z', decision: 'DENY', tool: 'Bash' }),
      ].join('\n') + '\n'
    );
    const { text, json } = status(project);
    const ledger = json.ledger as { entries: number; byDecision: Record<string, number> };
    expect(ledger.entries).toBe(3);
    expect(ledger.byDecision.REINJECT).toBe(2);
    expect(ledger.byDecision.DENY).toBe(1);
    expect(text).not.toMatch(/NO DECISIONS RECORDED/);
  });

  it('separates a known obstacle from one with a proven remedy', () => {
    // "12 obstacles" reads like progress. "4 with no proven remedy" is the actionable half,
    // and a remedy nobody has run is a guess this project has twice paid for.
    writeFileSync(
      join(project, '.enforcee', 'obstacles.json'),
      JSON.stringify({
        version: 2,
        obstacles: [
          { id: '1', kind: 'network', signature: 'egress blocks x', hits: 9, seen: [], evidence: '', resolution: 'run it elsewhere', confidence: 'observed' },
          { id: '2', kind: 'tooling', signature: 'binary not on PATH: shot', hits: 5, seen: [], evidence: '', confidence: 'unverified' },
        ],
      })
    );
    const { text, json } = status(project);
    const obs = json.obstacles as { known: number; unresolved: number };
    expect(obs.known).toBe(2);
    expect(obs.unresolved, 'an unsolved wall was counted as solved').toBe(1);
    expect(text).toMatch(/no proven remedy/);
  });

  it('survives a corrupt policy rather than refusing to report anything', () => {
    // Status is what you run WHEN something is wrong. It must not be the next thing to break.
    writeFileSync(join(project, '.enforcee', 'policy.json'), '{ this is not json');
    const { text } = status(project);
    expect(text).toMatch(/Enforcee/);
    expect(text).toMatch(/ledger/);
  });
});
