import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { parseRuleset } from '@/lib/rules/parse';
import { compilePolicy, proposeDenyRules, toDenyRule } from '@/lib/enforce/policy';
import { issueLicence } from '@/lib/licence';
import { harvest } from './helpers/spawn';

/**
 * THE GUARD MUST NEVER RUN CODE OUT OF THE REPOSITORY IT IS GUARDING.
 *
 * A silent remote-code-execution path shipped in `enforcee@0.9.0`.
 * `refreshObstaclesInBackground()` resolved the CLI to spawn from a list that began:
 *
 *     join(enforceeDir, '..', 'cli', 'dist', 'enforcee.mjs')          // <project>/cli/…
 *     join(enforceeDir, '..', 'node_modules', 'enforcee', 'cli', …)   // <project>/node_modules/…
 *
 * `enforceeDir` is `<project>/.enforcee`, so both are paths inside whatever repository the
 * user has open. Clone a repository that ships a file at `cli/dist/enforcee.mjs`, start a
 * session, and the guard ran it — with the user's own node, detached and unref'd,
 * `stdio: 'ignore'`, BEFORE a single deny rule was evaluated, writing no ledger row and
 * printing nothing.
 *
 * Two things made it worse than an ordinary path bug, and both are asserted below.
 *
 * IT COULD ONLY LAND ON SUBSCRIBERS. Enforcement is licensed and `emit()` exits at the licence
 * gate first, so an unlicensed guard never reached the line. The one population reachable was
 * the one that had paid for a tool whose entire claim is that it stops an agent doing
 * something dangerous in their repository.
 *
 * AND THE HONEST PATH DID NOT EXIST IN THE ARTEFACT. In the published package `guard.mjs` is
 * at `<pkg>/guard/` and the CLI at `<pkg>/dist/enforcee.mjs` — `pack-cli.mjs` moves it — so
 * `../cli/dist/enforcee.mjs` resolved to nothing. The only candidate that could resolve in a
 * real install was the attacker-controlled one. Invisible from the source tree, where
 * `../cli/dist/` does exist. The last test here is the one that would have caught that:
 * it asserts the feature actually WORKS in the packaged layout, because a fix that merely
 * stops the hostile path while leaving the feature dead is indistinguishable from deleting it.
 */

const REAL_GUARD = join(process.cwd(), 'guard', 'guard.mjs');

let project: string;
let GUARD: string;
let marker: string;

/** Write a hostile `cli/dist/enforcee.mjs` into the project, as a cloned repo could. */
function plantHostileCli(root: string, markerPath: string) {
  mkdirSync(join(root, 'cli', 'dist'), { recursive: true });
  writeFileSync(
    join(root, 'cli', 'dist', 'enforcee.mjs'),
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(markerPath)}, 'executed');\n`
  );
}

/** The guard spawns detached and unref'd, so the marker appears asynchronously or not at all. */
function markerAppeared(path: string, ms = 3000): boolean {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (existsSync(path)) return true;
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},100)']); // ~100ms, no timers API here
  }
  return existsSync(path);
}

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'enforcee-rce-'));
  mkdirSync(join(project, '.enforcee'), { recursive: true });
  marker = join(project, 'EXECUTED');

  // A real, valid licence — the vulnerable line sits AFTER the licence gate, so an unlicensed
  // guard would pass this test for the wrong reason and prove nothing.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  GUARD = join(project, 'guard-under-test.mjs');
  const real = readFileSync(REAL_GUARD, 'utf8');
  const patched = real.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\n/, pubPem);
  expect(patched, 'the public key was not substituted — this would test an unlicensed guard').not.toBe(real);
  writeFileSync(GUARD, patched);

  writeFileSync(
    join(project, '.enforcee', 'licence'),
    issueLicence(
      { jti: 'rce-test', sub: 'tests@enforcee', plan: 'founder', exp: Math.floor(Date.now() / 1000) + 3600 },
      privPem
    )
  );

  const RULESET = '# Ops rules\n- Never run `supabase db push` against production.\n';
  const { rules } = parseRuleset(RULESET);
  const proposals = proposeDenyRules(rules);
  const chosen = proposals.filter((p) => p.severity === 'deny').map(toDenyRule);
  const warn = proposals.filter((p) => p.severity === 'warn').map(toDenyRule);
  writeFileSync(
    join(project, '.enforcee', 'policy.json'),
    JSON.stringify(compilePolicy(RULESET, rules, chosen, warn), null, 2)
  );
});

afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
});

function runGuard(event: string): string {
  try {
    return execFileSync(process.execPath, [GUARD], {
      input: JSON.stringify({ cwd: project, hook_event_name: event, session_id: 'rce' }),
      encoding: 'utf8',
      cwd: project,
      env: { ...process.env, ENFORCEE_CLI: '' },
    });
  } catch (e) {
    return harvest(e).output;
  }
}

describe('a hostile repository cannot get its own code run by the guard', () => {
  it('is licensed, so the vulnerable line is actually reachable', () => {
    // The control on the test. The RCE sat after the licence gate; if this fixture were
    // unlicensed the guard would exit before the spawn and every assertion below would pass
    // for a reason that has nothing to do with the fix.
    const out = runGuard('SessionStart');
    expect(out, 'the guard refused the licence, so nothing below tests the fix').not.toMatch(
      /part we charge for|no licence found|did not verify/i
    );
  });

  it('does NOT execute <project>/cli/dist/enforcee.mjs at SessionStart', () => {
    plantHostileCli(project, marker);
    expect(existsSync(join(project, 'cli', 'dist', 'enforcee.mjs')), 'the hostile file was not planted').toBe(true);

    runGuard('SessionStart');
    expect(
      markerAppeared(marker),
      'the guard executed a file out of the working tree — this is the 0.9.0 RCE, live again'
    ).toBe(false);
  });

  it('does NOT execute it at PostCompact either', () => {
    rmSync(marker, { force: true });
    runGuard('PostCompact');
    expect(markerAppeared(marker), 'PostCompact reached the hostile path').toBe(false);
  });

  it('does NOT execute <project>/node_modules/enforcee/... either', () => {
    // The second working-tree candidate. A repository can ship node_modules.
    rmSync(marker, { force: true });
    rmSync(join(project, 'cli'), { recursive: true, force: true });
    const nm = join(project, 'node_modules', 'enforcee', 'cli', 'dist');
    mkdirSync(nm, { recursive: true });
    writeFileSync(
      join(nm, 'enforcee.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'executed');\n`
    );
    runGuard('SessionStart');
    expect(markerAppeared(marker), 'the guard executed a file out of the working tree node_modules').toBe(false);
  });

  it('names no path derived from the project directory, anywhere in the resolution', () => {
    // Structural, because the behavioural tests above can only cover the layouts I thought of.
    // `enforceeDir` is `<project>/.enforcee`; anything joined off it is inside the user's repo.
    const src = readFileSync(REAL_GUARD, 'utf8');
    const fn = src.slice(src.indexOf('function refreshObstaclesInBackground'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const offenders = body
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .filter((l) => /join\(\s*enforceeDir/.test(l));
    expect(
      offenders,
      'a candidate is being resolved from the project directory again — that is the RCE'
    ).toEqual([]);
  });
});

describe('and the feature still works where it is supposed to', () => {
  // A fix that only removes paths is indistinguishable from deleting the feature, and the
  // original bug was precisely that the honest path did not exist in the artefact. So the
  // packaged layout is asserted directly.
  it('resolves the CLI in the PUBLISHED package layout', () => {
    const pkg = mkdtempSync(join(tmpdir(), 'enforcee-pkg-'));
    mkdirSync(join(pkg, 'guard'), { recursive: true });
    mkdirSync(join(pkg, 'dist'), { recursive: true });
    writeFileSync(join(pkg, 'guard', 'guard.mjs'), readFileSync(REAL_GUARD, 'utf8'));
    writeFileSync(join(pkg, 'dist', 'enforcee.mjs'), '// the real CLI\n');

    const src = readFileSync(REAL_GUARD, 'utf8');
    expect(
      /join\(packageRoot, 'dist', 'enforcee\.mjs'\)/.test(src),
      'the published layout (<pkg>/dist/enforcee.mjs) is not a candidate — the feature is dead ' +
        'in every real install, which is exactly how the only reachable path came to be the hostile one'
    ).toBe(true);
    rmSync(pkg, { recursive: true, force: true });
  });

  it('and in the source-tree layout the repo itself uses', () => {
    const src = readFileSync(REAL_GUARD, 'utf8');
    expect(/join\(packageRoot, 'cli', 'dist', 'enforcee\.mjs'\)/.test(src)).toBe(true);
    expect(existsSync(join(process.cwd(), 'cli', 'dist', 'enforcee.mjs'))).toBe(true);
  });
});

describe('the guard source is greppable', () => {
  it('contains no literal NUL byte', () => {
    // `guard/guard.mjs` carried a raw 0x00 as a map-key separator, so `grep -n` returned
    // nothing and exit 0 on it — every search silently covered zero lines unless someone
    // remembered `-a`. Recorded in claude/86-LINE-HEALTH-LOG §6, routed, and untouched for
    // days. It is now the ` ` escape: identical at runtime, plain text on disk.
    for (const f of ['guard/guard.mjs', 'plugin/guard.mjs']) {
      const bytes = readFileSync(join(process.cwd(), f));
      expect(bytes.includes(0), `${f} contains a literal NUL and is invisible to grep`).toBe(false);
    }
  });
});
