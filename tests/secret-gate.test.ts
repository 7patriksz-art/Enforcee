import { beforeAll, describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harvest } from './helpers/spawn';
import { findCredentials, findInDiff, mask, CREDENTIAL_SHAPES, SHAPE_EXEMPT_FILES } from '@/lib/secret-gate';

/**
 * The gate that lets a credential be handed to an autonomous job at all.
 *
 * On 2026-08-17 Patrik asked for four scheduled jobs to carry a real GitHub PAT so they can
 * push their own work instead of stranding it in a project doc. This repository is PUBLIC.
 * Before that change a leaked token was not reachable from a scheduled run, because a
 * scheduled run had no credential; after it, a job doing `git add -A` over a scratch file
 * containing its own token writes a live push credential into a public repo — and the first
 * thing that credential can do is push.
 *
 * `src/lib/prevent/obstacles.ts` has redacted these shapes since 2026-08-16, but only when
 * PRINTING a report. It is a display filter and was never able to stop a commit. Nothing in
 * the push path looked at all. This file is the control for the thing that now does.
 *
 * THE HARD PART IS NOT CATCHING TOKENS, IT IS NOT CRYING WOLF. `tests/obstacles.test.ts`
 * legitimately contains `github_pat_11ABCDEFGHIJKLMNOPQRSTUV` as a fixture, `scripts/push.sh`
 * documents itself with `PAT=github_pat_...`, and `docs/` shows example keys. A gate that
 * refused those would fail every push on this repo forever and would be switched off inside a
 * day — worse than no gate, because it would be believed while it was on. So half the
 * assertions below are that it stays SILENT on the real contents of this repository.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The CLI imports TypeScript, so it is bundled before it is spawned — the same shape as
 * tests/licence-subject.test.ts, and for the same reason: this exercises the artefact
 * push.sh actually runs, and there is no shim to resolve on any platform.
 */
const GATE = join(ROOT, 'scripts', 'dist', 'secret-gate.mjs');

beforeAll(() => {
  buildSync({
    entryPoints: [join(ROOT, 'scripts', 'secret-gate.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: GATE,
    logLevel: 'warning',
  });
}, 60_000);

/** Shaped like the real thing: `github_pat_` + 82 chars = 93 total. Not a real token. */
const REAL_SHAPED_PAT =
  'github_pat_11ABCDEFG0' + 'q7Zx2Kd9mNpQrStUvWxYz3' + '_' + 'A'.repeat(30) + 'b9K4mQ2xZ7pL0nR5tV8wY1cE6';

function runGate(text: string, env: Record<string, string> = {}): { out: string; code: number } {
  try {
    const out = execFileSync(process.execPath, [GATE, '--text', '-'], {
      input: text,
      encoding: 'utf8',
      env: { ...process.env, PAT: '', ...env },
    });
    return { out, code: 0 };
  } catch (e) {
    const h = harvest(e);
    return { out: h.output, code: h.code ?? -1 };
  }
}

describe('the gate refuses a commit carrying a credential', () => {
  it('catches the exact credential this machine is holding, whatever shape it is', () => {
    // Layer 1. The only check guaranteed to catch THE token in hand, including a future
    // provider format nothing below knows about. Deliberately an unrecognisable shape.
    const weird = 'zzz-not-a-known-token-format-9f2a7c4e1b8d3a6f5e0c';
    const { out, code } = runGate(`+ const t = "${weird}";\n`, { PAT: weird });
    expect(code, 'a push carrying the live PAT was allowed').toBe(1);
    expect(out).toMatch(/THE CREDENTIAL THIS MACHINE IS HOLDING/);
  });

  it('catches a realistically-shaped GitHub PAT with no $PAT set at all', () => {
    const { out, code } = runGate(`+FOO=${REAL_SHAPED_PAT}\n`);
    expect(code, 'a 93-character github_pat_ went through').toBe(1);
    expect(out).toMatch(/GitHub fine-grained PAT/);
  });

  it('never prints the secret it is complaining about', () => {
    // A gate whose error message reproduces the credential has moved the leak into CI logs,
    // which on this project are read by the API and pasted into project docs.
    const { out } = runGate(`+FOO=${REAL_SHAPED_PAT}\n`);
    expect(out, 'the gate printed the whole token in its own error').not.toContain(REAL_SHAPED_PAT);
    expect(out, 'the masked form should still be identifiable').toMatch(/github_p…/);
  });

  it('catches the other providers this project actually holds keys for', () => {
    for (const [label, sample] of [
      ['Anthropic', 'sk-ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0'],
      ['Supabase', 'sbp_' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0'],
      ['private key', '-----BEGIN PRIVATE KEY-----'],
      ['url credential', 'https://user:hunter2hunter2@internal.example.com/x'],
    ] as [string, string][]) {
      const { code } = runGate(`+${sample}\n`);
      expect(code, `${label} was not caught`).toBe(1);
    }
  });
});

describe('the gate stays silent on this repository as it actually is', () => {
  // The half that decides whether anyone leaves it switched on.
  it('does not fire on the real test fixtures and docs in this repo', () => {
    // Fed through findInDiff, i.e. exactly how push.sh sees them: as a diff hunk attributed
    // to a path. These four files DO contain credential shapes — that is their job — and the
    // gate must recognise the path rather than the content.
    for (const f of SHAPE_EXEMPT_FILES as string[]) {
      const body = readFileSync(join(ROOT, ...f.split('/')), 'utf8');
      const hits = findInDiff(`+++ b/${f}\n${body}`, undefined) as { what: string }[];
      expect(hits.map((h) => h.what), `${f} would block every push on this repo`).toEqual([]);
    }
  });

  it('the exempt list is a closed set, so the gate cannot be turned off file by file', () => {
    // An exempt list is a hole in a control and the way holes get abused is by growing. Each
    // of these has to RECOGNISE a credential to do its job; nothing else does.
    expect((SHAPE_EXEMPT_FILES as string[]).slice().sort()).toEqual(
      [
        'scripts/push.sh',
        'src/lib/secret-gate.ts',
        'src/lib/prevent/obstacles.ts',
        'tests/obstacles.test.ts',
        'tests/secret-gate.test.ts',
      ].sort()
    );
    // An entry naming a file that does not exist is a hole for nothing, while the real file
    // goes on being scanned under a different path — a stale exemption that reads as coverage.
    for (const f of SHAPE_EXEMPT_FILES as string[]) {
      expect(existsSync(join(ROOT, ...f.split('/'))), `${f} is exempt but does not exist`).toBe(true);
    }
  });

  it('an exempt file is exempt from SHAPES ONLY, never from the live credential', () => {
    // The exemption must not become a place to park the real token. Layer 1 ignores it.
    const live = 'github_pat_11LIVE' + 'x'.repeat(76);
    const hits = findInDiff(`+++ b/tests/obstacles.test.ts\n+ const t = "${live}";\n`, live) as {
      what: string;
    }[];
    expect(hits.map((h) => h.what), 'the live PAT was waved through inside an exempt file').toEqual([
      'THE CREDENTIAL THIS MACHINE IS HOLDING ($PAT)',
    ]);
  });

  it('does not fire on the whole outgoing-commit range of this working tree', () => {
    // The end-to-end shape, run the way push.sh runs it. If this repo's real history trips
    // the gate, the gate is unusable regardless of how well it scores on fixtures.
    const { code, out } = (() => {
      try {
        const o = execFileSync(process.execPath, [GATE, 'HEAD~3..HEAD'], {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, PAT: '' },
        });
        return { code: 0, out: o };
      } catch (e) {
        const h = harvest(e);
        return { code: h.code ?? -1, out: h.output };
      }
    })();
    expect(code, `the last three commits of this repo trip the gate:\n${out}`).toBe(0);
    expect(out, 'the gate reported clean without saying how much it read').toMatch(/chars scanned/);
  });

  it('an empty or placeholder $PAT cannot make every line a match', () => {
    // `$PAT` is the literal string `proxy-injected` in a scheduled container, and empty in
    // most others. A naive `text.includes(literal)` with a short or empty literal marks the
    // entire diff as a leak, which is a false accusation — the exact failure this product
    // exists to prevent, produced by its own safety check.
    for (const bad of ['', '   ', 'proxy-injected']) {
      const hits = findCredentials('+ nothing secret here at all\n', bad) as unknown[];
      expect(hits, `PAT=${JSON.stringify(bad)} produced a false accusation`).toEqual([]);
    }
  });
});

describe('the gate cannot silently cover nothing', () => {
  it('exits 2, not 0, when it cannot read the commits it was asked to scan', () => {
    // Rule 9. A checker that fails open is worse than absent: push.sh would print "clean" and
    // push anyway. `git log` on a range that does not exist must NOT read as an empty diff.
    const { code, out } = (() => {
      try {
        const o = execFileSync(process.execPath, [GATE, 'no-such-ref-xyz..HEAD'], {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, PAT: '' },
        });
        return { code: 0, out: o };
      } catch (e) {
        const h = harvest(e);
        return { code: h.code ?? -1, out: h.output };
      }
    })();
    expect(code, 'an unreadable range was reported as a clean scan').toBe(2);
    expect(out).toMatch(/could not read the commits/);
  });

  it('carries a shape for every credential kind this project is known to hold', () => {
    // A named floor rather than a count: adding a provider should be a deliberate act, and
    // losing one should fail here rather than quietly stop being checked.
    const names = (CREDENTIAL_SHAPES as { name: string }[]).map((s) => s.name).join(' | ');
    for (const required of ['GitHub fine-grained PAT', 'Anthropic API key', 'Supabase', 'PEM private key']) {
      expect(names, `no shape covers ${required}`).toContain(required.split(' ')[0]);
    }
    expect((CREDENTIAL_SHAPES as unknown[]).length).toBeGreaterThan(6);
  });

  it('masks long and short secrets without ever reproducing them whole', () => {
    expect(mask('short')).not.toContain('short');
    const long = 'A'.repeat(93);
    expect(mask(long)).not.toContain(long);
    expect(mask(long)).toMatch(/93 chars/);
  });
});

describe('the gate is actually wired into the only path that pushes', () => {
  // THE FAILURE THIS SECTION EXISTS FOR, and it happened while the gate was being built.
  // A manual end-to-end test ran `git stash -u` first "to get a clean tree". That stashed the
  // uncommitted secret-gate.mjs and reverted push.sh to its committed form — so the push ran
  // with NO gate, went through, and put a token-shaped string on the public remote. The test
  // then reported the gate as broken. It was not: it had been removed by its own test setup.
  //
  // scripts/sabotage.mjs already asserts a sabotage APPLIED before scoring it, for exactly
  // this reason. That discipline had not been carried across to a check run by hand. A gate
  // that is present but not invoked is indistinguishable from no gate at all, so being
  // invoked is itself a property worth a test.
  const pushSh = readFileSync(join(ROOT, 'scripts', 'push.sh'), 'utf8');

  it('push.sh invokes the gate', () => {
    expect(pushSh, 'scripts/push.sh does not run the secret gate at all').toMatch(
      /^\s*npm run --silent secret-gate/m
    );
  });

  it('the gate runs BEFORE the push, not after it', () => {
    const gateAt = pushSh.search(/^\s*npm run --silent secret-gate/m);
    const pushAt = pushSh.search(/git push /);
    expect(gateAt, 'gate not found').toBeGreaterThan(-1);
    expect(pushAt, 'push not found').toBeGreaterThan(-1);
    expect(gateAt, 'the gate runs after the push, which scans a horse that has bolted').toBeLessThan(pushAt);
  });

  it('SKIP_CHECKS=1 cannot switch the gate off', () => {
    // SKIP_CHECKS exists for shipping past a slow or flaky test. It is never a reason to
    // publish a secret, and an escape hatch that also disables the safety check becomes the
    // default. The gate must sit outside that branch — after the `fi` that closes it.
    const skipBranch = pushSh.indexOf('if [ "${SKIP_CHECKS:-}" = "1" ]');
    const closingFi = pushSh.indexOf('\nfi\n', skipBranch);
    const gateAt = pushSh.search(/^\s*npm run --silent secret-gate/m);
    expect(skipBranch, 'the SKIP_CHECKS branch is gone — re-read this rule').toBeGreaterThan(-1);
    expect(closingFi, 'could not find the end of the SKIP_CHECKS branch').toBeGreaterThan(skipBranch);
    expect(gateAt, 'the secret gate is inside the SKIP_CHECKS branch and can be skipped').toBeGreaterThan(
      closingFi
    );
  });
});
