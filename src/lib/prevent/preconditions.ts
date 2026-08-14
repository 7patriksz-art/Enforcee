import { execSync } from 'node:child_process';
import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { runControlled, type ControlledResult } from './control';

/**
 * What an action needs before it can honestly be attempted.
 *
 * The gap this fills, from the research: infrastructure has mature preflight — Replicated's
 * troubleshoot.sh, openshift-preflight — and the agent world has only *authorisation*
 * ("is it allowed to?"), never *capability* ("can it, and is the environment actually
 * there?"). No prior art was found for treating a missing precondition as an outcome
 * distinct from a finding.
 *
 * That distinction is the whole point. "The linter found no problems" and "the linter is not
 * installed" are different sentences, and only one of them is good news.
 */

export type PreconditionKind = 'binary' | 'file' | 'dir' | 'env' | 'command';

export interface Precondition {
  kind: PreconditionKind;
  /** Binary name, path, env var name, or shell command. */
  target: string;
  /** Why the action needs it — shown to the person, so write it for them. */
  why: string;
  /** For 'command': the output must contain this for the check to count as passing. */
  expect?: string;
}

export interface PreconditionResult {
  precondition: Precondition;
  met: boolean;
  detail: string;
  /** How we know. Every result carries this so nothing is taken on trust. */
  evidence: string;
}

/**
 * Is this binary on PATH?
 *
 * No shell. The previous version built `sh -c "command -v <bin>"` and sanitised `bin` by
 * running it through JSON.stringify and slicing the quotes off — which escapes quotes and
 * backslashes and nothing else, so `;`, `$(…)` and backticks passed straight through into a
 * shell. The binary name is inferred from a rule the user wrote, so today it is inert; the
 * next caller that infers one from a plan, a transcript or model prose makes it live, and
 * that caller will not know this line exists.
 *
 * Reading the directories directly is also a better answer: it cannot be confused by shell
 * aliases or functions, which `command -v` reports as if they were executables.
 */
const SAFE_BIN = /^[A-Za-z0-9._+-]{1,64}$/;

const IS_WINDOWS = process.platform === 'win32';

/**
 * On Windows a command is a FILE WITH AN EXTENSION, and the execute bit does not exist.
 *
 * The shell-free rewrite that removed the injection hole was written and tested on Linux
 * only, so `node` was looked up as a file literally named `node` with the X_OK bit set.
 * On Windows it is `node.exe` and X_OK is meaningless — so `which()` returned null for
 * every binary that has ever existed, and preflight told every Windows user that node, git
 * and npm were not installed. A precondition layer that reports the environment as empty is
 * worse than not having one, because it is confidently wrong.
 *
 * Caught by Patrik running the suite on his own machine. The suite had never run on Windows,
 * so "all tests green" was a claim about Linux that read like a claim about the product.
 */
const PATHEXT = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
  .split(';')
  .map((e) => e.trim())
  .filter(Boolean);

function isExecutable(p: string): boolean {
  try {
    if (!statSync(p).isFile()) return false;
    if (IS_WINDOWS) return true;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The filenames a bare command name could correspond to on this platform. */
function candidateNames(bin: string): string[] {
  if (!IS_WINDOWS) return [bin];
  const already = PATHEXT.some((e) => bin.toLowerCase().endsWith(e.toLowerCase()));
  return already ? [bin] : [bin, ...PATHEXT.map((e) => bin + e.toLowerCase())];
}

function which(bin: string): string | null {
  if (!SAFE_BIN.test(bin)) return null;
  if (bin.includes('/') || bin.includes('\\')) {
    for (const name of candidateNames(bin)) if (isExecutable(name)) return name;
    return null;
  }
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const base = isAbsolute(dir) ? dir : join(process.cwd(), dir);
    for (const name of candidateNames(bin)) {
      const full = join(base, name);
      if (isExecutable(full)) return full;
    }
  }
  return null;
}

export function checkPrecondition(p: Precondition, cwd = process.cwd()): PreconditionResult {
  // isAbsolute, not startsWith('/'). A Windows absolute path is `C:\...`, which does not
  // start with a slash, so it was joined onto cwd and produced a path that cannot exist.
  const at = (t: string) => (isAbsolute(t) ? t : join(cwd, t));

  switch (p.kind) {
    case 'binary': {
      const path = which(p.target);
      return {
        precondition: p,
        met: path !== null,
        detail: path ? `${p.target} found` : `${p.target} is not on PATH`,
        evidence: path ? `command -v ${p.target} → ${path}` : `command -v ${p.target} → not found`,
      };
    }
    case 'file':
    case 'dir': {
      const full = at(p.target);
      const there = existsSync(full);
      const right = there && (p.kind === 'dir' ? statSync(full).isDirectory() : statSync(full).isFile());
      return {
        precondition: p,
        met: right,
        detail: !there ? `${p.target} does not exist` : right ? `${p.target} present` : `${p.target} is not a ${p.kind}`,
        evidence: `stat ${full} → ${there ? (right ? 'ok' : 'wrong type') : 'ENOENT'}`,
      };
    }
    case 'env': {
      const v = process.env[p.target];
      const set = typeof v === 'string' && v.trim() !== '';
      return {
        precondition: p,
        met: set,
        // Never echo the value. These are frequently credentials.
        detail: set ? `${p.target} is set` : `${p.target} is not set`,
        evidence: `env ${p.target} → ${set ? `set, ${v!.length} chars` : 'absent or empty'}`,
      };
    }
    case 'command': {
      try {
        // The PLATFORM shell, not a hardcoded POSIX one. `sh` does not exist on Windows,
        // so every 'command' precondition failed there with ENOENT and was reported as the
        // command failing rather than as the shell being absent — a wrong answer dressed up
        // as a real one.
        const out = execSync(p.target, {
          encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
        });
        const ok = p.expect ? out.includes(p.expect) : true;
        return {
          precondition: p,
          met: ok,
          detail: ok ? 'command succeeded' : `output did not contain ${JSON.stringify(p.expect)}`,
          evidence: `${p.target} → exit 0, ${out.trim().slice(0, 120)}`,
        };
      } catch (err) {
        const e = err as { status?: number; stderr?: string };
        return {
          precondition: p,
          met: false,
          detail: `command failed (exit ${e.status ?? '?'})`,
          evidence: `${p.target} → exit ${e.status ?? '?'}, ${(e.stderr ?? '').toString().trim().slice(0, 120)}`,
        };
      }
    }
  }
}

export interface PreflightReport {
  ready: boolean;
  met: PreconditionResult[];
  missing: PreconditionResult[];
  /** The sentence to show the person. Written so it cannot be mistaken for a clean bill. */
  summary: string;
}

export function preflight(preconditions: Precondition[], cwd = process.cwd()): PreflightReport {
  const results = preconditions.map((p) => checkPrecondition(p, cwd));
  const missing = results.filter((r) => !r.met);
  const met = results.filter((r) => r.met);

  return {
    ready: missing.length === 0,
    met,
    missing,
    summary: missing.length
      ? `Not ready: ${missing.length} of ${results.length} preconditions unmet. ` +
        `Running anyway would produce results that cannot be distinguished from real findings.`
      : `Ready: all ${results.length} preconditions met.`,
  };
}

/**
 * Preflight a tool AND prove it works, in one step.
 *
 * Being on PATH is not the same as being usable — a binary can exist and be the wrong
 * version, or be a broken symlink. This asks it a question with a known answer, so a later
 * negative result from that tool means something.
 */
export async function verifyTool(
  bin: string,
  controlCommand: string,
  expectInOutput: string
): Promise<ControlledResult<string>> {
  return runControlled({
    instrument: bin,
    control: () => which(bin) !== null,
    probe: () =>
      execSync(controlCommand, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }),
    interpret: (out) =>
      out.includes(expectInOutput)
        ? { verdict: 'CONFIRMED', reason: `${bin} answered its control correctly` }
        : { verdict: 'REFUTED', reason: `${bin} ran but did not produce the expected answer — treat its results as suspect` },
  });
}
