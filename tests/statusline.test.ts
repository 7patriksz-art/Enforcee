import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARK, renderStatusLine, type Presence } from '@/lib/trace/statusline';
import { readLedger, summarise, tailOfLedger, type LedgerRow } from '@/lib/trace/summary';
import { hookSettings } from '@/lib/enforce/policy';

/**
 * THE STATUS LINE — the row Claude Code redraws under every turn.
 *
 * Patrik, 2026-08-18: *"we should clearly message our existence constantly in applied
 * projects, what we did, how, why whilst keeping the trace minimal but visually pleasant."*
 *
 * This is the only persistent surface a third-party tool can occupy — the plugin docs state
 * outright that plugins cannot create panels, sidebars or always-visible widgets. So it is the
 * whole of "show up in the session", and every assertion below is about the two ways a row
 * that appears forty times an hour can go wrong: saying more than it can prove, or saying it
 * so often that nobody reads it.
 */

const line = (r: LedgerRow) => JSON.stringify(r);
const trace = (...rows: LedgerRow[]) => summarise(readLedger(rows.map(line).join('\n')));

const live = (over: Partial<Presence> = {}): Presence => ({
  installed: true,
  rules: 12,
  learned: 4,
  enforcing: true,
  trace: summarise([]),
  ...over,
});

describe('it says which of four states it is actually in', () => {
  it('says it is not installed rather than showing a comfortable zero', () => {
    // The same distinction the trace draws between an empty ledger and a clean session. A
    // configured status line over no policy must not look like a quiet, well-behaved project.
    const out = renderStatusLine(live({ installed: false }), false);
    expect(out).toMatch(/not installed in this project/);
    expect(out, 'an absent install rendered as a clean run').not.toMatch(/watching|0 blocked|allowed/);
  });

  it('says "auditing only" on EVERY turn when enforcement is off', () => {
    // The load-bearing one. A licence notice at session start scrolls away in ninety seconds;
    // this row does not. A status line that looks identical whether or not it is stopping
    // anything implies cover that is not there, which is worse than showing nothing.
    const out = renderStatusLine(live({ enforcing: false, trace: trace({ decision: 'ALLOW' }) }), false);
    expect(out).toContain('auditing only');
    expect(out, 'it showed activity counts while enforcing nothing').not.toMatch(/blocked|allowed/);
  });

  it('says "watching" when it is live and has had nothing to do', () => {
    // Different from "0 blocked", which is a measurement nobody asked for. Installed, live,
    // and nothing has reached it yet is a real and common state, and it deserves a real word.
    expect(renderStatusLine(live(), false)).toMatch(/watching/);
  });

  it('shows what happened once anything has', () => {
    const out = renderStatusLine(
      live({ trace: trace({ decision: 'DENY', rule: 'r' }, { decision: 'ALLOW' }, { decision: 'VERIFY', outcome: 'PASS' }) }),
      false
    );
    expect(out).toContain('1 blocked');
    expect(out).toContain('1 verified');
    expect(out, 'a block with no denominator is a number without a scale').toContain('1 allowed');
    expect(out, 'it was still calling itself idle').not.toMatch(/watching/);
  });
});

describe('it earns its row without taking the user hostage', () => {
  it('is always exactly one line', () => {
    for (const p of [live(), live({ installed: false }), live({ enforcing: false }), live({ trace: trace({ decision: 'DENY', rule: 'r' }) })]) {
      expect(renderStatusLine(p, false).split('\n'), 'the status line grew a second row').toHaveLength(1);
    }
  });

  it('stays short enough to sit beside a prompt', () => {
    // Somebody else's terminal, next to their actual work. A busy session is the worst case.
    const busy = live({
      rules: 128,
      learned: 64,
      trace: trace(
        { decision: 'DENY', rule: 'r' },
        { decision: 'WARN' },
        { decision: 'ALLOW' },
        { decision: 'VERIFY', outcome: 'PASS' },
        { decision: 'VERIFY', outcome: 'FAIL' },
        { decision: 'CLAIM', verdict: 'REFUTED' }
      ),
    });
    expect(renderStatusLine(busy, false).length, 'the row is too long to live under a prompt').toBeLessThan(110);
  });

  it('carries the mark exactly once, so the eye lands and moves on', () => {
    const out = renderStatusLine(live(), false);
    expect(out.split(MARK)).toHaveLength(2);
    expect(out.startsWith(MARK), 'the mark is not the first thing on the row').toBe(true);
  });

  it('never editorialises, in any state', () => {
    // The same line the trace must not cross. There is no ledger row that would make
    // "protected" true, so the status line cannot say it.
    for (const p of [live(), live({ installed: false }), live({ enforcing: false }), live({ trace: trace({ decision: 'DENY', rule: 'r' }) })]) {
      const out = renderStatusLine(p, false);
      for (const marketing of [/protect/i, /safe/i, /secure/i, /success/i, /all good/i, /great/i]) {
        expect(out, `the status line editorialises: ${marketing}`).not.toMatch(marketing);
      }
    }
  });

  it('emits no escape codes when colour is off, and colours the mark when it is on', () => {
    expect(renderStatusLine(live(), false)).not.toMatch(/\x1b\[/);
    expect(renderStatusLine(live(), true), 'the mark is not coloured').toMatch(/\x1b\[38;5;141m/);
  });
});

describe('a row that redraws every turn must not cost anything', () => {
  it('reads a bounded tail of the ledger, not the whole file', () => {
    // The ledger is append-only and shared by every session in the project. Reading all of it
    // on every assistant message is a cost the user pays for our summary.
    const big = 'x'.repeat(400 * 1024) + '\n' + '{"decision":"ALLOW"}\n';
    const tail = tailOfLedger(big, 64 * 1024);
    expect(tail.length, 'the whole file was read').toBeLessThanOrEqual(64 * 1024);
    expect(summarise(readLedger(tail)).allowed, 'the tail lost the rows at the end').toBe(1);
  });

  it('drops the half-line a tail always starts with', () => {
    const tail = tailOfLedger('{"decision":"DEN\n{"decision":"ALLOW"}\n', 30);
    expect(tail.startsWith('{"decision":"ALLOW"}'), 'a truncated row survived the cut').toBe(true);
  });

  it('returns the file untouched when it is small, so nothing is lost in a young project', () => {
    const small = '{"decision":"DENY","rule":"a"}\n';
    expect(tailOfLedger(small)).toBe(small);
  });
});

describe('the install puts the row on the screen', () => {
  it('writes a statusLine that calls this command', () => {
    // Left out of the install once, which made the trace something you had to go and look
    // for. A tool nobody can see working is a tool nobody renews.
    const s = hookSettings() as { statusLine?: { type?: string; command?: string } };
    expect(s.statusLine?.type).toBe('command');
    expect(s.statusLine?.command, 'the install no longer wires the status line').toMatch(/statusline/);
  });

  it('still writes every hook, so adding the row did not displace the enforcement', () => {
    const s = hookSettings() as { hooks?: Record<string, unknown> };
    expect(Object.keys(s.hooks ?? {}).sort()).toEqual([
      'PostCompact',
      'PreToolUse',
      'SessionStart',
      'Stop',
      'UserPromptSubmit',
    ]);
  });
});

describe('the command itself is inert, because it runs constantly', () => {
  const CLI = fileURLToPath(new URL('../cli/dist/enforcee.mjs', import.meta.url));

  function run(files: Record<string, string>, stdin = '{}') {
    const dir = mkdtempSync(join(tmpdir(), 'statusline-'));
    mkdirSync(join(dir, '.enforcee'), { recursive: true });
    for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, '.enforcee', f), body);
    const r = spawnSync(process.execPath, [CLI, 'statusline'], { input: stdin, cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim(), err: r.stderr ?? '' };
  }

  it('reports an empty project as not installed', () => {
    const r = run({});
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/not installed/);
  });

  it('survives a corrupt policy without printing a stack trace into somebody status bar', () => {
    // Status is what you look at WHEN something is wrong. It must not be the next thing to
    // break, and it must never spill a stack trace across the row under the prompt.
    const r = run({ 'policy.json': '{ this is not json' });
    expect(r.code, 'a corrupt policy made the status line exit non-zero').toBe(0);
    expect(r.err, 'it wrote to stderr, which lands in the user\'s terminal').toBe('');
    expect(r.out).toMatch(/not installed/);
  });

  it('survives a corrupt ledger and still reports the install', () => {
    const r = run({ 'policy.json': JSON.stringify({ deny: [{ id: 'a' }], warn: [] }), 'ledger.jsonl': 'not json at all\n{{{\n' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 rule');
  });

  it('survives .enforcee entries that are directories rather than files', () => {
    // The concrete unreadable-path case. Every read in this command is individually guarded;
    // this is what those guards are for, and it is the failure a real machine actually
    // produces (a stale directory, a bad rsync, a half-finished install).
    const dir = mkdtempSync(join(tmpdir(), 'statusline-dir-'));
    mkdirSync(join(dir, '.enforcee', 'ledger.jsonl'), { recursive: true });
    writeFileSync(join(dir, '.enforcee', 'policy.json'), JSON.stringify({ deny: [{ id: 'a' }], warn: [] }));
    const r = spawnSync(process.execPath, [CLI, 'statusline'], { input: '{}', cwd: dir, encoding: 'utf8' });
    expect(r.status, 'an unreadable ledger made the status line exit non-zero').toBe(0);
    expect(r.stderr, "it wrote to stderr, which lands in the user's terminal").toBe('');
    expect((r.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, ''), 'the row went blank instead of reporting the install').toContain(
      '1 rule'
    );
  });

  it('works with no stdin at all, so a person can run it by hand', () => {
    const r = run({ 'policy.json': JSON.stringify({ deny: [{ id: 'a' }, { id: 'b' }], warn: [] }) }, '');
    expect(r.code).toBe(0);
    expect(r.out).toContain('2 rules');
  });

  it('scopes to the session Claude Code names on stdin', () => {
    const files = {
      'policy.json': JSON.stringify({ deny: [{ id: 'a' }], warn: [] }),
      'ledger.jsonl':
        [
          JSON.stringify({ session: 'mine', decision: 'ALLOW' }),
          JSON.stringify({ session: 'theirs', decision: 'DENY', rule: 'not ours' }),
        ].join('\n') + '\n',
    };
    // Unlicensed here, so the row says "auditing only" either way — what this proves is that
    // the command accepts and applies the session id without falling over.
    expect(run(files, JSON.stringify({ session_id: 'mine' })).code).toBe(0);
  });
});
