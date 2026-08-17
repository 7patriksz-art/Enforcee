/**
 * One place that knows the difference between "the program printed nothing" and "there was
 * no program".
 *
 * This exists because on 2026-08-17 a catch block spelled `${e.stdout ?? ''}${e.stderr ?? ''}`
 * turned a spawn that never started into `''`, and four assertions then accused the licence
 * script of printing the wrong thing when it had never run. Every harness in this repo that
 * harvests a failed child had the same shape. One idea, one place — the duplicated-source
 * defect is the twelfth of its kind here, and copying a one-line guard into six files is how
 * the eleven before it started.
 *
 * `tests/spawn-honesty.test.ts` enforces that no catch harvests a child's output without
 * naming this case.
 */

export type Harvested = {
  /** Combined stdout+stderr, or a loud SPAWN FAILED line when there was no child at all. */
  output: string;
  stdout: string;
  stderr: string;
  /** The child's exit code. `null` when it never ran, which is not the same as 0 or 1. */
  code: number | null;
  /** True when the process could not be created — ENOENT, EACCES, a .cmd shim on Windows. */
  spawnFailed: boolean;
};

export function harvest(e: unknown): Harvested {
  const err = e as { status?: number | null; stdout?: string; stderr?: string; message?: string };
  const stdout = err.stdout ?? '';
  const stderr = err.stderr ?? '';
  // No output AND no exit status means the OS never handed us a process. A program that
  // legitimately printed nothing still exits, so it has a status.
  const spawnFailed = !stdout && !stderr && (err.status === undefined || err.status === null);
  return {
    stdout,
    stderr,
    code: err.status ?? null,
    spawnFailed,
    output: spawnFailed ? `SPAWN FAILED: ${err.message ?? String(e)}` : `${stdout}${stderr}`,
  };
}
