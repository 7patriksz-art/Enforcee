#!/usr/bin/env node
/**
 * Validates the LIKE fake used by `tests/subscription-claim-wildcards.test.ts` against a
 * real PostgreSQL server.
 *
 * That test defends an identity decision, so its fake matcher must not be another guess at
 * the shape of the thing it is checking. This script asks Postgres and JS the same
 * questions and fails on any disagreement.
 *
 * It is deliberately NOT part of the vitest run: CI has no database, and a check that
 * silently passes when it cannot run is the failure mode this project keeps paying for
 * (INVARIANTS E-3). It exits 0 with a loud SKIPPED line when no server is reachable, and
 * prints its own coverage — the number of pairs actually compared — either way.
 *
 *   psql must be on PATH and $PGDATABASE/$PGUSER reachable, e.g.
 *   service postgresql start && sudo -u postgres node scripts/like-semantics-check.mjs
 */
import { execFileSync } from 'node:child_process';

export function likeToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '%') out += '[\\s\\S]*';
    else if (ch === '_') out += '[\\s\\S]';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

const SUBJECTS = [
  'a1_345@example.com',
  'aQZ999@example.com',
  'victim@example.com',
  'A1_345@EXAMPLE.COM',
  'ab@example.com',
  'a@example.com',
  'a1_345@example.co',
  'x%y@example.com',
  'p.q+r@example.com',
];
const PATTERNS = [
  'a_____@example.com',
  '%@example.com',
  'a1_345@example.com',
  'victim@example.com',
  '%',
  '_',
  'a%',
  '%example%',
  'x%y@example.com',
  'x\\%y@example.com',
  'a1\\_345@example.com',
  'P.Q+R@example.com',
  '',
  'a________________@example.com',
];

function pg(sql) {
  return execFileSync('psql', ['-tAqX', '-c', sql], { encoding: 'utf8' }).trim();
}

let reachable = true;
try {
  pg('select 1');
} catch {
  reachable = false;
}

if (!reachable) {
  console.log('SKIPPED — no reachable PostgreSQL server. 0 pairs compared. This check proves nothing today.');
  process.exit(0);
}

const version = pg('show server_version');
let compared = 0;
const disagreements = [];

for (const p of PATTERNS) {
  for (const s of SUBJECTS) {
    const lit = (v) => `'${v.replace(/'/g, "''")}'`;
    const fromPg = pg(`select ${lit(s)} ilike ${lit(p)}`) === 't';
    const fromJs = likeToRegExp(p).test(s);
    compared++;
    if (fromPg !== fromJs) disagreements.push({ pattern: p, subject: s, postgres: fromPg, js: fromJs });
  }
}

console.log(`PostgreSQL ${version}: ${compared} pairs compared, ${disagreements.length} disagreements.`);
if (compared < PATTERNS.length * SUBJECTS.length) {
  console.error(`Coverage too low: expected ${PATTERNS.length * SUBJECTS.length} pairs.`);
  process.exit(1);
}
if (disagreements.length) {
  for (const d of disagreements) console.error(`  ${JSON.stringify(d)}`);
  console.error('The LIKE fake no longer matches PostgreSQL. subscription-claim-wildcards.test.ts is testing the wrong thing.');
  process.exit(1);
}
console.log('The fake matches PostgreSQL on every pair, including both metacharacters and the escape.');
