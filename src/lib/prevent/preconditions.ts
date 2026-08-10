import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
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

function which(bin: string): string | null {
  try {
    return execFileSync('sh', ['-c', `command -v ${JSON.stringify(bin).slice(1, -1)}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

export function checkPrecondition(p: Precondition, cwd = process.cwd()): PreconditionResult {
  const at = (t: string) => (t.startsWith('/') ? t : `${cwd}/${t}`);

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
        const out = execFileSync('sh', ['-c', p.target], {
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
      execFileSync('sh', ['-c', controlCommand], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }),
    interpret: (out) =>
      out.includes(expectInOutput)
        ? { verdict: 'CONFIRMED', reason: `${bin} answered its control correctly` }
        : { verdict: 'REFUTED', reason: `${bin} ran but did not produce the expected answer — treat its results as suspect` },
  });
}
