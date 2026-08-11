import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The guard turns an InstructionsLoaded event into OBSERVED load evidence.
 *
 * This matters more than its size suggests. The charter named RECONSTRUCTED load evidence
 * as the product's candidate fatal flaw — we could say a rule file was probably in context,
 * not that it was. Claude Code reports each load directly, and the shape below was captured
 * from a real session rather than read off the docs, which document only the common fields
 * and say nothing about file_path, memory_type or load_reason.
 *
 * The two reasons that matter most are nested_traversal and path_glob_match, because those
 * are exactly the files Anthropic does NOT re-inject after compaction — the narrow, real
 * gap the product is left with once the vendor's native behaviour is accounted for.
 */
function runGuard(payload: object, cwd: string): void {
  execFileSync(process.execPath, [new URL('../guard/guard.mjs', import.meta.url).pathname], {
    input: JSON.stringify(payload),
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ENFORCEE_LICENCE: process.env.ENFORCEE_TEST_LICENCE ?? '' },
  });
}

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'enforcee-il-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
  return dir;
}

describe('InstructionsLoaded → observed load evidence', () => {
  it('records the file path, memory type and load reason', () => {
    const dir = fixture();
    runGuard(
      {
        hook_event_name: 'InstructionsLoaded',
        session_id: 's1',
        cwd: dir,
        file_path: `${dir}/sub/CLAUDE.md`,
        memory_type: 'Project',
        load_reason: 'nested_traversal',
      },
      dir
    );
    const entry = JSON.parse(readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').pop()!);
    expect(entry.decision).toBe('LOADED');
    expect(entry.loadReason).toBe('nested_traversal');
    expect(entry.memoryType).toBe('Project');
    expect(entry.filePath).toBe(`${dir}/sub/CLAUDE.md`);
    // The whole point: this is observation, not reconstruction, and it is labelled as such.
    expect(entry.evidence).toBe('OBSERVED');
  });

  it('records an unfamiliar load_reason verbatim rather than dropping it', () => {
    // 'include' and 'compact' are documented matcher values we could not reproduce locally.
    // Special-casing the three we did see would silently lose the two we did not.
    const dir = fixture();
    runGuard(
      { hook_event_name: 'InstructionsLoaded', session_id: 's2', cwd: dir, file_path: `${dir}/CLAUDE.md`, memory_type: 'Project', load_reason: 'compact' },
      dir
    );
    const entry = JSON.parse(readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').pop()!);
    expect(entry.loadReason).toBe('compact');
  });

  it('never blocks — recording a load must not interfere with loading', () => {
    const dir = fixture();
    const out = execFileSync(process.execPath, [new URL('../guard/guard.mjs', import.meta.url).pathname], {
      input: JSON.stringify({ hook_event_name: 'InstructionsLoaded', session_id: 's3', cwd: dir, file_path: 'x', load_reason: 'session_start' }),
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ENFORCEE_LICENCE: '' },
    });
    expect(out).not.toContain('deny');
  });

  it('survives a payload missing the undocumented fields', () => {
    // The docs list only session_id, transcript_path, cwd and hook_event_name. If a future
    // version ships exactly that, this must degrade to nulls rather than throw inside a hook.
    const dir = fixture();
    expect(() => runGuard({ hook_event_name: 'InstructionsLoaded', session_id: 's4', cwd: dir }, dir)).not.toThrow();
    const entry = JSON.parse(readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').pop()!);
    expect(entry.filePath).toBeNull();
    expect(entry.loadReason).toBeNull();
  });
});

/**
 * claude-code#52176, open since 23 April 2026: "InstructionsLoaded hook fires 3x per file per
 * compact event." A reporter with ~50 rules files measured 261 KB of reload against an
 * expected 87 KB. Separately observed here: in headless `-p` mode, `--continue` fires a fresh
 * session_start load for the root CLAUDE.md on every turn.
 *
 * Found by our own weekly vendor-drift watch, the day after the load-evidence code shipped.
 * Without this, a ledger count of "your rules loaded N times" is wrong by 3x — the kind of
 * number that is embarrassing to discover in a customer's screenshot.
 *
 * The de-duplication is also just the honest reading: the same file loading for the same
 * reason in the same session is one fact, however many times the hook announces it.
 */
describe('duplicate load events', () => {
  it('records one entry for three identical fires — the #52176 bug', () => {
    const dir = fixture();
    const payload = {
      hook_event_name: 'InstructionsLoaded', session_id: 'sA', cwd: dir,
      file_path: `${dir}/CLAUDE.md`, memory_type: 'Project', load_reason: 'compact',
    };
    for (let i = 0; i < 3; i++) runGuard(payload, dir);
    const loaded = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.decision === 'LOADED');
    expect(loaded).toHaveLength(1);
  });

  it('still records the same file when the load reason differs', () => {
    // A file loading at session_start and again on compact is two real facts, not a duplicate.
    const dir = fixture();
    const base = { hook_event_name: 'InstructionsLoaded', session_id: 'sB', cwd: dir, file_path: `${dir}/CLAUDE.md`, memory_type: 'Project' };
    runGuard({ ...base, load_reason: 'session_start' }, dir);
    runGuard({ ...base, load_reason: 'compact' }, dir);
    const loaded = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.decision === 'LOADED');
    expect(loaded.map((e) => e.loadReason).sort()).toEqual(['compact', 'session_start']);
  });

  it('does not deduplicate across sessions', () => {
    const dir = fixture();
    const base = { hook_event_name: 'InstructionsLoaded', cwd: dir, file_path: `${dir}/CLAUDE.md`, load_reason: 'session_start' };
    runGuard({ ...base, session_id: 'one' }, dir);
    runGuard({ ...base, session_id: 'two' }, dir);
    const loaded = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.decision === 'LOADED');
    expect(loaded).toHaveLength(2);
  });
});
