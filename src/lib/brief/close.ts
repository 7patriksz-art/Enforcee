/**
 * STEP 6: verify thoroughly at the end, and if it is not green, that IS the work list.
 *
 * `close` runs every acceptance criterion the brief committed to BEFORE the work started and
 * reports the result. It is deliberately dumb: it does not decide what "done" means, it only
 * executes checks somebody already wrote down. That is the whole value — "done" stops being
 * something an agent can assert about itself.
 *
 * THREE OUTCOMES, and the third is the one that matters:
 *   PASS     the command ran and its output matched
 *   FAIL     the command ran and it did not
 *   PENDING  nobody ever wrote a check — NOT a pass, and it keeps the exit code non-zero
 *
 * A pending criterion counting as success is how a plan quietly becomes a wish. This project
 * has six recorded instances of a check that silently covered nothing; treating "no check" as
 * "fine" would be the seventh, built deliberately.
 */
import { execSync } from 'node:child_process';
import type { Acceptance, Brief } from './types';

export type Outcome = 'PASS' | 'FAIL' | 'PENDING';

export interface CloseResult {
  acceptance: Acceptance;
  /** The requirement text, so a report reads as English rather than ids. */
  requirement: string;
  outcome: Outcome;
  detail: string;
}

export interface CloseReport {
  results: CloseResult[];
  passed: number;
  failed: number;
  pending: number;
  /** True only when every criterion ran AND passed. Pending is never green. */
  green: boolean;
  summary: string;
}

/** Injectable so tests never shell out, and so a dry run can be shown before it is trusted. */
export type Runner = (cmd: string) => { ok: boolean; output: string };

export const shellRunner: Runner = (cmd) => {
  try {
    // execSync uses the platform shell, so this works on Windows too — `sh` does not exist
    // there, and tests/portability.test.ts bans hardcoding it.
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000 });
    return { ok: true, output };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number | null; message?: string };
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    // No output AND no status means the shell never started the command — a different thing
    // from a command that failed quietly, and reporting them the same way is how a false
    // accusation gets made. Same rule as tests/helpers/spawn.ts.
    if (!output && (err.status === undefined || err.status === null)) {
      return { ok: false, output: `COULD NOT RUN: ${err.message ?? String(e)}` };
    }
    return { ok: false, output };
  }
};

export function close(brief: Brief, run: Runner = shellRunner): CloseReport {
  const results: CloseResult[] = brief.acceptance.map((a) => {
    const requirement = brief.requirements.find((r) => r.id === a.for)?.text ?? a.for;
    if (!a.run) {
      return {
        acceptance: a,
        requirement,
        outcome: 'PENDING' as const,
        detail: 'no check was ever written for this, so nothing here proves it either way',
      };
    }
    const { ok, output } = run(a.run);
    if (!ok) {
      return { acceptance: a, requirement, outcome: 'FAIL' as const, detail: output.trim().slice(-400) || 'exited non-zero with no output' };
    }
    if (a.expect && !output.includes(a.expect)) {
      return {
        acceptance: a,
        requirement,
        outcome: 'FAIL' as const,
        detail: `ran, but the output does not contain ${JSON.stringify(a.expect)}`,
      };
    }
    return { acceptance: a, requirement, outcome: 'PASS' as const, detail: a.expect ? `output contains ${JSON.stringify(a.expect)}` : 'exited 0' };
  });

  const passed = results.filter((r) => r.outcome === 'PASS').length;
  const failed = results.filter((r) => r.outcome === 'FAIL').length;
  const pending = results.filter((r) => r.outcome === 'PENDING').length;
  const green = results.length > 0 && failed === 0 && pending === 0;

  return {
    results,
    passed,
    failed,
    pending,
    green,
    summary: results.length === 0
      ? 'this brief has no acceptance criteria at all, so it cannot be closed'
      : `${passed}/${results.length} proved · ${failed} failed · ${pending} never had a check`,
  };
}
