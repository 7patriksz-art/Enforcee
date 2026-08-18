import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { harvest } from './helpers/spawn';

/**
 * The PRODUCT, not the function.
 *
 * `tests/obstacles-mentions.test.ts` proves the predicates. This proves the binary people
 * install actually consults them — the distinction that cost this project the `learn` defect,
 * where `userTurnsFromTranscript` was correct, exported, unit-tested and called by nothing,
 * so the shipped CLI mined the assistant's own words while the test suite stayed green and
 * the website claimed the opposite. A correct control wired to nothing is the failure shape
 * this repo has now hit four times.
 *
 * Runs the committed bundle, because that is what `npm i -g enforcee` puts on a stranger's
 * PATH.
 */

const CLI = resolve(__dirname, '..', 'cli', 'dist', 'enforcee.mjs');

/** A transcript that carries real tool results but no turn any person typed. */
function machineOnlyTranscript(): string {
  return (
    [
      // A scheduled prompt: role "user", written by the scheduler. This is the record that
      // made the 08-18 run's corpus look like a person's.
      {
        type: 'user',
        origin: { kind: 'task-notification', subkind: 'scheduled-trigger' },
        message: { role: 'user', content: 'You are the OBSTACLE SWEEP for this project.' },
      },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'running' }] } },
      {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', content: 'total 40\ndrwxr-xr-x 8 claude claude 4096\n' }] },
      },
      {
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', content: 'ok\nDone in 61ms\n' }] },
      },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n') + '\n'
  );
}

/** The same, plus one turn a person actually typed. */
function humanTranscript(): string {
  return (
    machineOnlyTranscript().trim() +
    '\n' +
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'can you check whether the build is green' } }) +
    '\n'
  );
}

function run(cwd: string, dir: string): { output: string; code: number | null } {
  try {
    const out = execFileSync('node', [CLI, 'obstacles', dir], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { output: out.replace(/\x1b\[[0-9;]*m/g, ''), code: 0 };
  } catch (e) {
    const h = harvest(e);
    expect(h.spawnFailed, `the CLI never ran: ${h.output}`).toBe(false);
    return { output: h.output.replace(/\x1b\[[0-9;]*m/g, ''), code: h.code };
  }
}

let bundleExists = false;
beforeAll(() => {
  bundleExists = existsSync(CLI);
});

describe('the shipped binary refuses to call a machine-only corpus clean', () => {
  it('the committed bundle exists at all — otherwise every assertion below is vacuous', () => {
    expect(bundleExists, `no bundle at ${CLI}; run npm run build:cli`).toBe(true);
  });

  it('exits 2 and says nothing was analysed, rather than "that is a real answer"', () => {
    const project = mkdtempSync(join(tmpdir(), 'enforcee-cov-'));
    const sessions = join(project, 'sessions');
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, 'a.jsonl'), machineOnlyTranscript());

    const { output, code } = run(project, sessions);
    expect(output, 'the false clean bill is back').not.toMatch(/That is a real answer/);
    expect(output).toMatch(/Nothing was analysed that records your work/i);
    expect(output).toMatch(/no turn a person typed/i);
    expect(code, 'a refusal that exits 0 is a refusal nothing can act on').toBe(2);
  });

  it('reports clean normally when the corpus holds a turn the person typed', () => {
    const project = mkdtempSync(join(tmpdir(), 'enforcee-cov-'));
    const sessions = join(project, 'sessions');
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, 'a.jsonl'), humanTranscript());

    const { output, code } = run(project, sessions);
    expect(output, 'a legitimate clean result was refused — the guard is over-tightened').toMatch(
      /Nothing recognised blocked this project/
    );
    expect(code).toBe(0);
  });

  it('a repeat run over the same unchanged files still reports clean', () => {
    // Nothing is re-read on the second pass, so the coverage fact has to survive in the
    // store. Without that this guard would refuse every legitimate refresh.
    const project = mkdtempSync(join(tmpdir(), 'enforcee-cov-'));
    const sessions = join(project, 'sessions');
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, 'a.jsonl'), humanTranscript());

    expect(run(project, sessions).code).toBe(0);
    const second = run(project, sessions);
    expect(second.output, 'the second pass refused what the first accepted').toMatch(/Nothing recognised blocked/);
    expect(second.code).toBe(0);
  });
});
