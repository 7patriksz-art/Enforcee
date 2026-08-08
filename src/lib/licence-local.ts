import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
