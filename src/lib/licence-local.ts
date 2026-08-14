import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { LICENCE_PUBLIC_KEY } from './licence-key';
import { verifyLicence, type LicenceCheck } from './licence';

/**
 * Find and check a licence on this machine, without touching the network.
 *
 * Search order, most explicit first:
 *   1. ENFORCEE_LICENCE               — CI, containers, anything scripted
 *   2. ./.enforcee/licence            — per-project, checked in or not, your call
 *   3. ~/.enforcee/licence            — the normal case, set once per machine
 */
export const LICENCE_PATHS = {
  project: join('.enforcee', 'licence'),
  home: join(homedir(), '.enforcee', 'licence'),
};

export function findLicence(cwd = process.cwd()): { token: string | null; from: string | null } {
  const env = process.env.ENFORCEE_LICENCE?.trim();
  if (env) return { token: env, from: 'ENFORCEE_LICENCE' };

  const project = join(cwd, LICENCE_PATHS.project);
  if (existsSync(project)) return { token: readFileSync(project, 'utf8').trim(), from: project };

  if (existsSync(LICENCE_PATHS.home)) {
    return { token: readFileSync(LICENCE_PATHS.home, 'utf8').trim(), from: LICENCE_PATHS.home };
  }

  return { token: null, from: null };
}

export function checkLocalLicence(cwd?: string): LicenceCheck & { from: string | null } {
  const { token, from } = findLicence(cwd);
  return { ...verifyLicence(token, LICENCE_PUBLIC_KEY), from };
}

/**
 * Install a licence on this machine.
 *
 * This exists because the install instructions said, on every platform:
 *
 *     mkdir -p ~/.enforcee && echo "<your licence>" > ~/.enforcee/licence
 *
 * That is a bash line. On Windows PowerShell `mkdir -p` is an error, `~` is not expanded
 * the same way, and `echo` writes UTF-16 with a BOM that the verifier then fails to parse.
 * So the paid tier's very first step was broken for Windows users, and the failure looked
 * like a bad licence rather than a bad instruction — the worst possible shape, because the
 * user blames the thing they just paid for.
 *
 * The fix is not a second copy of the instruction for PowerShell. Two copies of one idea is
 * how this project has produced twelve bugs. The fix is that the tool does it.
 *
 * VERIFY BEFORE WRITING. A licence that does not parse must never reach the disk: a file
 * that exists but does not verify is indistinguishable, to every later run, from a licence
 * that expired — and the user has no way to tell which happened.
 */
export function setLicence(
  token: string,
  opts: { path?: string; verify?: (t: string) => LicenceCheck } = {}
): { ok: true; path: string; check: LicenceCheck } | { ok: false; reason: string } {
  const trimmed = token
    // Strip a UTF-8 BOM and any wrapping quotes a shell may have left behind. Users paste
    // this out of an email; being strict about whitespace here buys nothing and costs
    // support time.
    .replace(/^﻿/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!trimmed) return { ok: false, reason: 'No licence given.' };

  const check = (opts.verify ?? ((t: string) => verifyLicence(t, LICENCE_PUBLIC_KEY)))(trimmed);
  if (!check.ok) {
    return {
      ok: false,
      reason: `${check.reason ?? 'That licence did not verify'} — nothing was written.`,
    };
  }

  const path = opts.path ?? LICENCE_PATHS.home;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${trimmed}\n`, 'utf8');

  // A licence key is a credential. 0600 where the OS honours it; Windows ignores the mode
  // and throws on some filesystems, and failing to narrow permissions is not a reason to
  // fail the install.
  try {
    chmodSync(path, 0o600);
  } catch {
    /* not supported here — the file is still written and still valid */
  }

  return { ok: true, path, check };
}
