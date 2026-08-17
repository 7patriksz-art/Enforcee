import { beforeAll, describe, expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
      ['private key', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCz9Xk2mQ' + 'a'.repeat(40)],
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
    //
    // THE RANGE HAS TO EXIST BEFORE ITS CONTENTS MEAN ANYTHING. This asked for `HEAD~3..HEAD`
    // unconditionally and kept main red on all three platforms for the three commits that
    // introduced the gate: `actions/checkout` clones with `fetch-depth: 1`, so in CI `HEAD~3`
    // is not a revision at all. The gate behaved correctly — exit 2, "could not read the
    // commits it is supposed to scan", which is the fail-closed rule two tests below — and
    // this assertion rendered it as "the last three commits of this repo trip the gate".
    //
    // A checker that could not run, reported as a credential found, is a false accusation
    // manufactured by the test for the gate whose entire premise is that it never cries wolf.
    // The local suite could not see it because a sandbox clone is full-depth, so `push.sh`
    // ran 980 green tests and pushed onto a red main.
    //
    // So: establish the range first and name the shallow checkout as the cause when it is
    // missing, and keep exit 2 distinct from exit 1 in the message. Failing loudly here is
    // deliberate — CLAUDE.md, "never let a check silently cover nothing". Skipping when the
    // history is absent would make this test pass in the one place it has never run.
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
    const DEPTH = 3;
    expect(
      git('rev-parse', '--is-shallow-repository'),
      'this checkout is shallow, so the gate cannot be run over real history here — the CI checkout needs fetch-depth: 0'
    ).toBe('false');
    expect(
      Number(git('rev-list', '--count', 'HEAD')),
      `fewer than ${DEPTH + 1} commits are reachable, so HEAD~${DEPTH} does not resolve`
    ).toBeGreaterThan(DEPTH);

    const range = `HEAD~${DEPTH}..HEAD`;
    const { code, out } = (() => {
      try {
        const o = execFileSync(process.execPath, [GATE, range], {
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
    expect(
      code,
      code === 2
        ? `the gate could not RUN over ${range}. This is not a credential and not a clean result:\n${out}`
        : `the last ${DEPTH} commits of this repo trip the gate:\n${out}`
    ).toBe(0);
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
  //
  // READ IT AS CONTENT, NOT AS A CHECKOUT. These assertions search for literals containing
  // `\n`, and git hands a Windows runner CRLF unless told otherwise — so `indexOf('\nfi\n')`
  // returned -1 and "could not find the end of the SKIP_CHECKS branch" was reported on
  // windows-latest while the branch was exactly where it should be. Second false accusation
  // in this one file, and the one platform where it fires is the one no local run covers.
  //
  // Normalising here is the fix for the assertions. `.gitattributes` pins `*.sh` to LF as
  // well, because a shell script checked out with CRLF does not merely fail a test, it fails
  // to execute at all: `bad interpreter: /usr/bin/env bash^M`.
  const readAsLf = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const PUSH_SH = join(ROOT, 'scripts', 'push.sh');
  const pushSh = readAsLf(PUSH_SH);

  /** The three positions every assertion below is about, so CRLF can be exercised through it. */
  const positions = (src: string) => ({
    skipBranch: src.indexOf('if [ "${SKIP_CHECKS:-}" = "1" ]'),
    closingFi: src.indexOf('\nfi\n', src.indexOf('if [ "${SKIP_CHECKS:-}" = "1" ]')),
    gateAt: src.search(/^\s*npm run --silent secret-gate/m),
  });

  it('push.sh invokes the gate', () => {
    expect(pushSh, 'scripts/push.sh does not run the secret gate at all').toMatch(
      /^\s*npm run --silent secret-gate/m
    );
  });

  it('reads push.sh as content, so a CRLF checkout cannot fake a missing gate', () => {
    // The windows-latest failure, reproduced on EVERY platform: write push.sh's own bytes out
    // with CRLF and read the copy back through the same helper the assertions use. A
    // normalisation done inside the test instead would assert nothing — it would compare a
    // string against itself.
    const tmp = join(mkdtempSync(join(tmpdir(), 'enforcee-crlf-')), 'push.sh');
    writeFileSync(tmp, pushSh.replace(/\n/g, '\r\n'), 'utf8');
    // Assert the fixture is genuinely what a Windows checkout produces, or this control is
    // scoring a sabotage that never happened — scripts/sabotage.mjs rule 1, applied in-test.
    expect(readFileSync(tmp, 'utf8'), 'the CRLF fixture is not CRLF, so this proves nothing').toContain('\r\n');

    const p = positions(readAsLf(tmp));
    expect(p.closingFi, 'a CRLF checkout hides the end of the SKIP_CHECKS branch').toBeGreaterThan(p.skipBranch);
    expect(p.gateAt, 'a CRLF checkout hides the gate invocation').toBeGreaterThan(p.closingFi);
  });

  it('.gitattributes pins shell scripts to LF', () => {
    // Not a test-only concern: a CRLF `push.sh` cannot run.
    const attrs = readAsLf(join(ROOT, '.gitattributes'));
    expect(attrs, '*.sh is not pinned to LF, so a Windows checkout gets an unrunnable script').toMatch(
      /^\*\.sh\s+text\s+eol=lf\s*$/m
    );
  });

  it('CI checks out full history, so the end-to-end gate scan has commits to read', () => {
    // The other half of the all-platforms red. The one assertion that runs the gate over real
    // commits needs `HEAD~3` to resolve, and `actions/checkout` defaults to depth 1. That test
    // now fails loudly rather than skipping when the checkout is shallow — this one names the
    // line that has to stay, so deleting it is caught here rather than as a confusing gate
    // failure in CI.
    const ci = readAsLf(join(ROOT, '.github', 'workflows', 'ci.yml'));
    expect(ci, 'ci.yml no longer runs the suite, so this control is pointed at nothing').toMatch(
      /^\s*- run: npm test\s*$/m
    );
    expect(ci, 'the CI checkout is shallow again — the end-to-end gate scan cannot run').toMatch(
      /uses: actions\/checkout@v\d+\s*\n\s*with:\s*\n\s*fetch-depth: 0/
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
    const { skipBranch, closingFi, gateAt } = positions(pushSh);
    expect(skipBranch, 'the SKIP_CHECKS branch is gone — re-read this rule').toBeGreaterThan(-1);
    expect(closingFi, 'could not find the end of the SKIP_CHECKS branch').toBeGreaterThan(skipBranch);
    expect(gateAt, 'the secret gate is inside the SKIP_CHECKS branch and can be skipped').toBeGreaterThan(
      closingFi
    );
  });
});

describe('the gate is silent on every file this repository actually tracks', () => {
  /**
   * THE STRONGEST ANTI-CRY-WOLF PROPERTY, and it needs no git history at all — identical on a
   * full clone, a depth-1 checkout and a scheduled container.
   *
   * The end-to-end assertion above scans `HEAD~3..HEAD`: three diffs, whatever happens to be
   * in them. That is the right shape for "does the gate work the way push.sh runs it", and it
   * says nothing about the other 200 files. Scanning the tree once, on a clone with no parent
   * commit, is what surfaced three files the gate WOULD have refused:
   *
   *   · src/lib/licence.ts and tests/licence-key-shapes.test.ts — `-----BEGIN PRIVATE KEY-----`,
   *     because they parse PEM. A header with no key material after it is not a secret.
   *   · READ-MY-SESSIONS.md — `https://user:password@host`, documenting the shape.
   *
   * Both patterns were tightened rather than the exempt list widened: an exemption hides a
   * whole file forever, a tighter pattern only stops lying. Stated limit, in the source: a
   * purely alphabetic real password now slips layer 2. Layer 1 is the guarantee.
   *
   * TRACKED FILES ONLY. A first draft walked the directory and flagged `.env.local`, which
   * does hold a live key, is gitignored, and can therefore never appear in a diff — a false
   * accusation against a correctly-configured repo, produced by the check whose whole premise
   * is that it does not make them. `git ls-files` is exactly the set that can reach a commit.
   */
  it('does not fire on a single tracked file', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(files.length, 'git ls-files returned nothing — this would report the repo clean forever').toBeGreaterThan(80);

    const offenders: string[] = [];
    let scanned = 0;
    for (const f of files) {
      let body: string;
      try {
        body = readFileSync(join(ROOT, ...f.split('/')), 'utf8');
      } catch {
        continue; // unreadable or binary; the gate reads a text diff, so this matches its reach
      }
      if (body.includes('\u0000')) continue;
      scanned += body.length;
      for (const h of findInDiff(`+++ b/${f}\n${body}`, undefined)) offenders.push(`${f}: ${h.what}`);
    }
    expect(scanned, 'nothing was actually read').toBeGreaterThan(100_000);
    expect(
      offenders,
      'the gate fires on a clean checkout of this repository. It would refuse every push, and a ' +
        'gate that cries wolf is switched off inside a day — worse than no gate, because it is ' +
        'believed while it is on.'
    ).toEqual([]);
  });
});
