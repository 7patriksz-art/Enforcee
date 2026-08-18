#!/usr/bin/env node
/**
 * Break every control on purpose and require it to go red.
 *
 * Charter honesty rule 6: "A control that could not have failed is not a control." Seven
 * controls on this project have now passed over the exact thing they were written to catch.
 * The most recent kept main red on windows-latest for two commits while
 * tests/portability.test.ts sat green with a rule titled "never execFiles a .cmd or .bat,
 * even by explicit name" — the literal was one line away from the call and the regex was
 * line-scoped.
 *
 * A green suite says nothing about whether a control can fail. This says it, per control,
 * by name.
 *
 * TWO THINGS THIS HARNESS DOES THAT THE OBVIOUS VERSION DOES NOT
 *
 *  1. It ASSERTS THE SABOTAGE APPLIED before running anything. A string replace that matches
 *     nothing reports "control passed" from a sabotage that never happened — a false green
 *     manufactured by the very tool built to find false greens. That has occurred on this
 *     project. Every entry below is checked for its `find` text, with an expected number of
 *     occurrences, and a mismatch is a FAILURE of the harness, not a skip.
 *
 *  2. It reports WHICH TEST went red, not how many. An identical failure count either way
 *     hides a stale test failing for an unrelated reason — so each entry names the assertion
 *     it expects to see, and a red run that goes red somewhere else is reported as a MISS.
 *
 * It never spawns npm: `process.execPath` runs vitest's own entry point directly. npm is a
 * `.cmd` shim on Windows and Node refuses to execFile one at all since the CVE-2024-27980
 * mitigation — the bug this harness exists to keep caught.
 *
 *   node scripts/sabotage.mjs           run every sabotage
 *   node scripts/sabotage.mjs <substr>  run only those whose name matches
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

/**
 * Each entry: remove the fix, and name the control that must notice.
 *
 * `find` must appear exactly `occurrences` times in `file` before the swap. `expect` is
 * matched against the failing output — the assertion text or the test title, so a red for
 * an unrelated reason is not counted as a pass.
 */
const FLOOR_BLOCK = "  it('there are plans and entitlements to check at all', () => {\n    // THE FLOOR. Every commercial assertion below runs inside `for (const p of PLANS)`. Empty\n    // that array \u2014 a bad refactor, a filter that matches nothing, a data-loading change \u2014 and\n    // every loop body never executes and this entire file goes green while the pricing page\n    // has no plans on it. The assertions are real; the coverage was not guaranteed.\n    //\n    // Six recorded instances on this project of a scan silently covering nothing, two of them\n    // parsers that matched zero rules while every assertion passed over the empty result.\n    // Found by tests/coverage-floors.test.ts, which is the sweep two security audits named as\n    // the highest-value item left and neither carried out.\n    //\n    // Named plans rather than a bare count: a number picked to pass today drifts into\n    // meaninglessness, whereas these three are the product.\n    expect(PLANS.length, 'PLANS is empty \u2014 every loop below is vacuous').toBeGreaterThan(2);\n    for (const id of ['free', 'builder', 'founder']) {\n      expect(\n        PLANS.some((p) => p.id === id),\n        `the ${id} plan is gone from PLANS, so nothing below checks it`\n      ).toBe(true);\n      expect(ENTITLEMENTS[id as keyof typeof ENTITLEMENTS], `no entitlements for ${id}`).toBeDefined();\n    }\n  });\n\n";

const SABOTAGES = [
  {
    name: 'shim-literal-anywhere',
    why: 'the exact 2026-08-17 bug: the shim name one variable away from the spawn',
    file: 'tests/licence-subject.test.ts',
    find: 'execFileSync(process.execPath, [BUNDLE, ...args], {',
    replace:
      "const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';\n" +
      "    return execFileSync(NPM, ['run', 'licence:repo', '--silent', '--', ...args], {",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /never names a .cmd or .bat shim ANYWHERE/,
  },
  {
    name: 'shim-literal-on-the-call-line',
    why: 'the older shape, which the line-scoped rules do catch — proves they still work',
    file: 'tests/licence-subject.test.ts',
    find: 'execFileSync(process.execPath, [BUNDLE, ...args], {',
    replace: "return execFileSync('npm.cmd', ['run', 'licence:repo', '--silent', '--', ...args], {",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /never execFiles a .cmd or .bat|never names a .cmd or .bat shim ANYWHERE/,
  },
  {
    name: 'bare-npm-spawn',
    why: 'execFileSync("npm") threw ENOENT on every Windows runner',
    file: 'tests/licence-subject.test.ts',
    find: 'execFileSync(process.execPath, [BUNDLE, ...args], {',
    replace: "return execFileSync('npm', ['run', 'licence:repo', '--silent', '--', ...args], {",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /never spawns npm or another .cmd shim by bare name/,
  },
  {
    name: 'silent-spawn-failure',
    why: 'a spawn that never started must not look like a script that printed nothing — that is how four false accusations were produced',
    file: 'tests/licence-subject.test.ts',
    find: "if (!err.stdout && !err.stderr) return `SPAWN FAILED: ${err.message ?? String(e)}`;",
    replace: '',
    occurrences: 1,
    run: 'tests/spawn-honesty.test.ts',
    expect: /reports a failed spawn as a failed spawn/,
  },
  {
    name: 'widened-exempt-list',
    why: 'the exempt list is a hole in the shim rule; growing it must not be a one-line edit',
    file: 'tests/portability.test.ts',
    find: "    join('scripts', 'sabotage.mjs'), // the harness that proves this rule can go red\n",
    replace:
      "    join('scripts', 'sabotage.mjs'), // the harness that proves this rule can go red\n" +
      "    join('scripts', 'pack-cli.mjs'), // <- sabotage: a third file, quietly\n",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /the exempt list is a closed set of two/,
  },
  {
    name: 'doc-names-a-missing-npm-script',
    why: 'a doc telling a session to run a script that does not exist — the `npm run doctor` shape',
    file: 'README.md',
    find: 'Enforcee gives you an answer with evidence, and then stops the things it can stop.',
    replace:
      'Enforcee gives you an answer with evidence, and then stops the things it can stop.\n\n' +
      'Run `npm run doctor-that-does-not-exist` first.',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /every .npm run <script>. is a script in package.json/,
  },
  {
    name: 'plan-ticks-off-an-unbuilt-command',
    why: 'the exact 2026-08-17 failure: a plan recording `enforcee onboard` as SHIPPED when it is not on main',
    file: 'PLAN-ENGINE.md',
    find: '### CHANGE 6',
    replace: 'SHIPPED: `enforcee onboard` — done.\n\n### CHANGE 6',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /may not mark one SHIPPED unless it is/,
  },
  {
    name: 'doc-names-a-missing-script-file',
    why: '`node scripts/sabotage.mjs` was cited as a whole release’s verification while the file was not on main',
    file: 'docs/LICENCE-KEY.md',
    find: 'node cli/dist/enforcee.mjs licence set',
    replace: 'node scripts/no-such-script.mjs && node cli/dist/enforcee.mjs licence set',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /every script path a doc tells you to run is a file that exists/,
  },
  {
    name: 'sitemap-omission',
    why: '/what-is-already-free was missing from the sitemap entirely and nothing noticed',
    file: 'src/app/sitemap.ts',
    find: "{ path: '/what-is-already-free', priority: 0.8, changeFrequency: 'monthly' },",
    replace: '',
    occurrences: 1,
    run: 'tests/discoverability.test.ts',
    expect: /lists every public page that is meant to be indexed/,
  },
  {
    name: 'gated-page-indexed',
    why: 'putting a gated page in the sitemap leaks it to search',
    file: 'src/app/sitemap.ts',
    find: "{ path: '/audit', priority: 0.9, changeFrequency: 'weekly' },",
    replace:
      "{ path: '/audit', priority: 0.9, changeFrequency: 'weekly' },\n" +
      "  { path: '/admin', priority: 0.9, changeFrequency: 'weekly' },",
    occurrences: 1,
    run: 'tests/discoverability.test.ts',
    expect: /lists no gated page/,
  },
  {
    name: 'doc-scan-stops-at-the-top-level',
    why:
      'the project-docs half of doc-claims: a walker that does not descend reports a clean ' +
      'result from a directory it only half read — the same shape as the contrast parser that ' +
      'matched zero rules twice while every assertion passed over the empty object',
    file: 'src/lib/doc-claims.ts',
    find: 'if (entry.isDirectory()) markdownFiles(root, rel, out);',
    replace: 'if (entry.isDirectory()) continue;',
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /walks a directory that is not the repository/,
  },
  {
    name: 'doc-scan-invents-a-subcommand',
    why:
      'reading the SECOND word after `enforcee` turns `enforcee audit CLAUDE.md` into a claim ' +
      'that a subcommand named CLAUDE exists — a false accusation manufactured by the checker ' +
      'built to stop false claims. An earlier draft of this file did exactly that.',
    file: 'src/lib/doc-claims.ts',
    find: "const ENFORCEE_INSTRUCTION = /(?:`|\\$ |npx )(?:npx )?enforcee ([a-z][a-z-]*)/g;",
    replace: "const ENFORCEE_INSTRUCTION = /(?:`|\\$ |npx )(?:npx )?enforcee (?:[a-z-]+ )?([A-Za-z][A-Za-z.-]*)/g;",
    occurrences: 1,
    run: 'tests/doc-claims.test.ts',
    expect: /does not manufacture a claim out of an argument|was read as a subcommand named CLAUDE/,
  },
  {
    name: 'unwired-secret-gate',
    why:
      'a gate that exists but is not invoked is indistinguishable from no gate. This happened ' +
      'for real on 2026-08-17: a manual test stashed the uncommitted gate away, the push ran ' +
      'unguarded, and a token-shaped string reached the public remote',
    file: 'scripts/push.sh',
    find: 'npm run --silent secret-gate',
    replace: '# npm run --silent secret-gate',
    occurrences: 1,
    run: 'tests/secret-gate.test.ts',
    expect: /push.sh invokes the gate|does not run the secret gate/,
  },
  {
    name: 'secret-gate-floor-dropped',
    why: 'lowering the length floor is how the gate stops distinguishing a real token from a fixture, in either direction',
    file: 'src/lib/secret-gate.ts',
    find: 're: /github_pat_[A-Za-z0-9_]{60,}/g,',
    replace: 're: /github_pat_[A-Za-z0-9_]{200,}/g,',
    occurrences: 1,
    run: 'tests/secret-gate.test.ts',
    expect: /catches a realistically-shaped GitHub PAT/,
  },
  {
    name: 'crlf-blind-push-sh-read',
    why:
      'the 2026-08-17 windows-latest red: push.sh assertions search for literals containing ' +
      "`\\n`, git checks the file out with CRLF on Windows, and the gate's own test reported " +
      '"could not find the end of the SKIP_CHECKS branch" about a file that was correct. A ' +
      'false accusation produced by the test for the check whose premise is that it never ' +
      'cries wolf, on the one platform no local run covers',
    file: 'tests/secret-gate.test.ts',
    find: "const readAsLf = (file: string) => readFileSync(file, 'utf8').replace(/\\r\\n/g, '\\n');",
    replace: "const readAsLf = (file: string) => readFileSync(file, 'utf8');",
    occurrences: 1,
    run: 'tests/secret-gate.test.ts',
    expect: /a CRLF checkout hides the end of the SKIP_CHECKS branch|reads push.sh as content/,
  },
  {
    name: 'pem-header-alone-is-a-secret',
    why:
      'loosening the PEM rule back to a bare header makes the gate fire on src/lib/licence.ts ' +
      'and its test, which parse PEM — it would refuse every push from a clone with no parent, ' +
      'which is the cry-wolf failure that gets a gate switched off',
    file: 'src/lib/secret-gate.ts',
    find: "re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\\r\\n\\s]+[A-Za-z0-9+/=]{40,}/g,",
    replace: "re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,",
    occurrences: 1,
    run: 'tests/secret-gate.test.ts',
    expect: /does not fire on a single tracked file|silent on every file/,
  },
  {
    name: 'rce-guard-runs-code-from-the-working-tree',
    why:
      'the exact silent RCE shipped in enforcee@0.9.0: the guard resolved the CLI it spawns ' +
      'from <project>/cli/dist/enforcee.mjs, so any repository a SUBSCRIBER cloned could get ' +
      'its own file executed at SessionStart, before a single deny rule ran',
    file: 'guard/guard.mjs',
    find: `    const packageRoot = resolve(here, '..');
    const candidates = [
      join(packageRoot, 'dist', 'enforcee.mjs'), // published package layout
      join(packageRoot, 'cli', 'dist', 'enforcee.mjs'), // source tree and plugin layout
    ];

    /** Inside the installed package, and not reached by climbing out of it. */
    const containedInPackage = (p) => {
      const rel = relative(packageRoot, resolve(p));
      return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
    };

    const override = process.env.ENFORCEE_CLI;
    const cli =
      override && existsSync(override)
        ? override
        : candidates.find((c) => {
            try {
              // Containment is defence in depth: the list above is already package-relative,
              // so this can only fire if a future edit reintroduces a project-relative entry.
              // It is asserted by a test rather than trusted.
              return containedInPackage(c) && existsSync(c);
            } catch {
              return false;
            }
          });
    if (!cli) return;`,
    replace: "    const candidates = [\n      process.env.ENFORCEE_CLI,\n      join(enforceeDir, '..', 'cli', 'dist', 'enforcee.mjs'),\n      join(here, '..', 'cli', 'dist', 'enforcee.mjs'),\n      join(enforceeDir, '..', 'node_modules', 'enforcee', 'cli', 'dist', 'enforcee.mjs'),\n    ].filter(Boolean);\n\n    const cli = candidates.find((c) => {\n      try {\n        return existsSync(c);\n      } catch {\n        return false;\n      }\n    });\n    if (!cli) return;",
    occurrences: 1,
    run: 'tests/guard-cli-resolution.test.ts',
    expect: /does NOT execute|executed a file out of the working tree/,
  },
  {
    name: 'plans-loop-with-no-floor',
    why:
      'the enumeration shape two security audits named as the highest-value sweep left and ' +
      'neither performed: empty PLANS and every commercial assertion in plans.test.ts passes ' +
      'over nothing, while the pricing page has no plans on it',
    file: 'tests/plans.test.ts',
    // Removes the WHOLE floor block. An earlier version of this entry deleted only the
    // `.length` line and the control stayed green — correctly, because
    // `expect(PLANS.some(...)).toBe(true)` also fails on an empty array and is itself a floor.
    // The harness reported "STAYED GREEN — not a control" and it was the sabotage that was
    // wrong, not the control. Exactly what asserting-the-sabotage-applied is for.
    find: FLOOR_BLOCK,
    replace: '',
    occurrences: 1,
    run: 'tests/coverage-floors.test.ts',
    expect: /asserts it is not empty|no non-empty assertion/,
  },
  {
    name: 'coverage-sweep-blind-to-a-strong-floor',
    why:
      'the sweep must recognise a closed-set assertion as a floor. Its first draft did not, ' +
      'and reported a real and STRONGER guard as a violation — a control that teaches people ' +
      'to write the worse version of the thing it demands',
    file: 'tests/coverage-floors.test.ts',
    find: '  return subject.test(src) || lengthAnywhere.test(src);',
    replace: '  return lengthAnywhere.test(src);',
    occurrences: 1,
    run: 'tests/coverage-floors.test.ts',
    expect: /asserts it is not empty|no non-empty assertion/,
  },
  {
    name: 'release-gate-starved-by-head-age',
    why:
      'restoring the HEAD-based cooling-off starves the gate: four scheduled jobs push daily ' +
      'from 00:00 to 12:00 and the gate runs at 10:00, so HEAD is almost never 12h old and a ' +
      'security release sits unpublished while nothing reports an error',
    file: '.github/workflows/auto-release.yml',
    find: 'AGE=$(( $(date -u +%s) - $(git log -1 --format=%ct "$BUMP_SHA") ))',
    replace: 'AGE=$(( $(date -u +%s) - $(git log -1 --format=%ct HEAD) ))',
    occurrences: 1,
    run: 'tests/release-gate.test.ts',
    expect: /measures cooling-off from the version bump|measured on HEAD again/,
  },
  {
    name: 'test-demands-deep-checkout',
    why:
      'a test asserting the ambient checkout is non-shallow turns its own need into a ' +
      'constraint on every workflow running the suite. It blocked the 0.9.1 security release ' +
      'on all three platforms while ci.yml was green on the same commit',
    file: 'tests/secret-gate.test.ts',
    find: "    const tmp = mkdtempSync(join(tmpdir(), 'enforcee-gate-hist-'));",
    replace:
      "    expect(execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim()).toBe('false');\n" +
      "    const tmp = mkdtempSync(join(tmpdir(), 'enforcee-gate-hist-'));",
    occurrences: 1,
    run: 'tests/portability.test.ts',
    expect: /demands the ambient checkout have git history|build the history the test needs/,
  },
  {
    name: 'reach-grades-an-unseen-surface',
    why:
      'the false accusation found by installing the real tarball: "Never use emojis in commit ' +
      'messages" reported VIOLATED against an emoji in prose, badged proven-by-code, in the ' +
      'free audit that is the whole shop window',
    file: 'src/lib/checks/deterministic.ts',
    find: "  const surface = unseenSurface(rule.text);",
    replace: "  const surface = null;",
    occurrences: 1,
    run: 'tests/reach.test.ts',
    expect: /commit messages|never graded from the output/,
  },
  {
    name: 'reach-silences-a-real-violation',
    why:
      'over-correcting is the other failure: a gate that returns UNVERIFIABLE even when the ' +
      'code IS present silences real violations, and it fails quietly and in our favour',
    file: 'src/lib/checks/deterministic.ts',
    find: "  if (result && region && FORBIDDING.includes(rule.check.kind) && !hasCode(output) && result.verdict !== 'NOT_APPLICABLE') {",
    replace: "  if (result && region && FORBIDDING.includes(rule.check.kind) && result.verdict !== 'NOT_APPLICABLE') {",
    occurrences: 1,
    run: 'tests/reach.test.ts',
    expect: /STILL CATCHES the real violation|let through/,
  },
  {
    name: 'artefact-audit-accuses-prose',
    why:
      'the false accusation as a user meets it: the SHIPPED bytes reporting VIOLATED for a ' +
      'commit-message rule against a paragraph of prose. Asserted on npm-dist, not src/, ' +
      'because the RCE proved the artefact and the tree are different products',
    file: 'src/lib/checks/deterministic.ts',
    find: "  const surface = unseenSurface(rule.text);",
    replace: "  const surface = null;",
    occurrences: 1,
    run: 'tests/artefact-e2e.test.ts',
    expect: /accuses prose of a commit-message violation|does NOT accuse prose/,
  },
  {
    name: 'attestation-accepts-a-tampered-body',
    why:
      'the whole attack: take a real signed receipt, turn a VIOLATED into a FOLLOWED, hand it ' +
      'to a client. Signing the digest we were GIVEN rather than the one we recompute makes ' +
      'that work, and every other assertion about the signature still passes',
    file: 'src/lib/attest.ts',
    find: '  const recomputed = digestOf(body as Omit<Receipt, \'digest\'>);\n\n  if (recomputed !== claimed) {',
    replace: '  const recomputed = attestation.digest;\n\n  if (recomputed !== claimed) {',
    occurrences: 1,
    run: 'tests/artefact-e2e.test.ts',
    expect: /an edited receipt was accepted/,
  },
  {
    name: 'wrong-key-type-read-as-forgery',
    why:
      'node returns false rather than throwing when an RSA key is handed to an Ed25519 verify, ' +
      'so without asking the key its type a client holding the wrong file is told, in red, that ' +
      'their supplier forged the receipt — a false accusation aimed at the one party who cannot ' +
      'check our work',
    file: 'src/lib/attest.ts',
    find: "  if (key.asymmetricKeyType !== 'ed25519') {",
    replace: '  if (false) {',
    occurrences: 1,
    run: 'tests/attest-file.test.ts',
    expect: /a key of the wrong TYPE is unverifiable/,
  },
  {
    name: 'unsigned-receipt-called-forged',
    why: 'an unsigned receipt has not failed a check, it has not had one. INVARIANTS H-3',
    file: 'src/lib/attest-file.ts',
    find: "    return {\n      outcome: 'UNVERIFIABLE',\n      signature: 'UNVERIFIABLE',\n      reason: 'This is a receipt, but nobody signed it.",
    replace: "    return {\n      outcome: 'REFUTED',\n      signature: 'REFUTED',\n      reason: 'This is a receipt, but nobody signed it.",
    occurrences: 1,
    run: 'tests/attest-file.test.ts',
    expect: /an unsigned receipt is unverifiable, not forged/,
  },
  {
    name: 'empty-receipt-signed-off-as-good',
    why:
      'a signature over a receipt that grades zero rules is cryptographically perfect and ' +
      'evidentially empty. INVARIANTS E-3: scanned === 0 is never a pass',
    file: 'src/lib/attest-file.ts',
    find: '  if (covers.rules === 0) {',
    replace: '  if (false) {',
    occurrences: 1,
    run: 'tests/attest-file.test.ts',
    expect: /an empty receipt was reported as good evidence|covering ZERO rules is UNVERIFIABLE/,
  },
  {
    name: 'founder-signing-given-away',
    why:
      'signed receipts are the Founder entitlement in src/lib/plans.ts. A licence check that ' +
      'stops at "is there a licence" hands the $290 tier to every $19 subscriber, and nothing ' +
      'about the output would look wrong',
    file: 'cli/index.ts',
    find: '    const entitled = lic.ok && entitlementsFor(lic.payload.plan).attestation;',
    replace: '    const entitled = lic.ok;',
    occurrences: 1,
    run: 'tests/artefact-e2e.test.ts',
    expect: /a Builder licence was allowed to sign/,
  },
  {
    name: 'pending-criterion-counts-as-green',
    why:
      'if a criterion nobody wrote a check for counts as success, writing no checks becomes ' +
      'the winning move and the whole contract is theatre. Six recorded instances on this ' +
      'project of a check that silently covered nothing',
    file: 'src/lib/brief/close.ts',
    find: '  const green = results.length > 0 && failed === 0 && pending === 0;',
    replace: '  const green = results.length > 0 && failed === 0;',
    occurrences: 1,
    run: 'tests/close.test.ts',
    expect: /PENDING keeps the whole report from going green|pending criterion was absorbed/,
  },
  {
    name: 'empty-brief-reports-green',
    why: 'an empty checklist is the oldest way to pass an audit',
    file: 'src/lib/brief/close.ts',
    find: '  const green = results.length > 0 && failed === 0 && pending === 0;',
    replace: '  const green = failed === 0 && pending === 0;',
    occurrences: 1,
    run: 'tests/close.test.ts',
    expect: /no acceptance rows is not green|zero criteria reported green/,
  },
  {
    name: 'brief-invents-a-check-it-cannot-derive',
    why:
      'an invented acceptance criterion passes and teaches nothing, which rebuilds inside the ' +
      'tool the exact failure the tool exists to stop',
    file: 'src/lib/brief/extract.ts',
    find: '      const own = commands.find((c) => r.text.includes(c));',
    replace: '      const own = commands.find((c) => r.text.includes(c)) ?? commands[0];',
    occurrences: 1,
    run: 'tests/brief.test.ts',
    expect: /unrelated sentence as proof|criterion was invented/,
  },
  {
    name: 'release-gate-blocks-on-any-invariant-change',
    why:
      'INVARIANTS.md did not exist at the last tag, so `git diff --quiet` read its creation as ' +
      'a reversal and the gate would have refused every release forever, with a reason that ' +
      'was not true',
    file: '.github/workflows/auto-release.yml',
    find: '            DELETED=$(git diff --numstat "$LAST_TAG" HEAD -- INVARIANTS.md | awk \'{print $2}\')',
    replace: '            DELETED=$(git diff --quiet "$LAST_TAG" HEAD -- INVARIANTS.md && echo 0 || echo 1)',
    occurrences: 1,
    run: 'tests/release-gate.test.ts',
    expect: /invariant REVERSED, not on the file merely existing|counts removed lines/,
  },
  {
    name: 'scheduled-prompt-mined-as-the-user',
    why:
      "a scheduled task's own prompt arrives with role:'user' and origin.kind 'task-notification'; " +
      'the text filter names that channel but the real record does not START with the tag, so ' +
      'in a scheduled container `learn` analysed a corpus that was 100% its own instructions',
    file: 'src/lib/preferences.ts',
    find: "    if (r.origin?.kind && MACHINE_ORIGIN_KINDS.has(r.origin.kind)) continue;",
    replace: '',
    occurrences: 1,
    run: 'tests/learn-user-turns.test.ts',
    expect: /scheduled task's own prompt is being mined|empty corpus, not a confident one|structured field/,
  },
  // ── 2026-08-18, the obstacle sweep pointed at its own container ────────────────────────
  //
  // Four untruths in one run, three of them false accusations inside the product whose
  // headline is zero false accusations. Each control below is one of them, and each has to be
  // able to go red by name or it is decoration.
  {
    name: 'machine-only-corpus-called-clean',
    why:
      'in a scheduled container the only transcript on disk is the run own, and `obstacles` ' +
      'answered "Nothing recognised blocked this project. That is a real answer." over it ' +
      'while `learn` refused the identical file with exit 2',
    file: 'src/lib/prevent/obstacles.ts',
    find: '  return c.filesWithHumanTurns > 0 || c.humanCorpusPreviously;',
    replace: '  return true;',
    occurrences: 1,
    run: 'tests/obstacles-mentions.test.ts',
    expect: /no turn a person typed|refuses to report clean|nothing was checked/i,
  },
  {
    name: 'comment-about-a-failure-counted-as-one',
    why:
      'the 401 pattern matched this file own comment describing the last time the 401 pattern ' +
      'false-accused somebody: the agent read a file about 401s and the product recorded that ' +
      'its credentials had been rejected',
    file: 'src/lib/prevent/obstacles.ts',
    find: '      const m = firstRealMatch(p.re, raw);',
    replace: '      const m = p.re.exec(raw);',
    occurrences: 1,
    run: 'tests/obstacles-mentions.test.ts',
    expect: /comment about 401s|mention of a failure is not a failure|JSDoc continuation/i,
  },
  {
    name: 'json-encoded-newline-hides-the-comment-marker',
    why:
      'tool results arrive as JSON.stringify(...), so a whole file read is ONE physical line ' +
      'with every break as the two characters backslash and n; the first version of the ' +
      'mention guard looked for real newlines only and changed nothing at all',
    file: 'src/lib/prevent/obstacles.ts',
    find: '  const start = Math.max(realStart, escStart);',
    replace: '  const start = realStart;',
    occurrences: 1,
    run: 'tests/obstacles-mentions.test.ts',
    expect: /JSON-encoded newline|how tool results actually arrive/i,
  },
  {
    name: 'grep-line-number-hides-the-comment-marker',
    why:
      'reading source through `grep -n` puts <file>:<line>: in front of the comment marker, ' +
      'which hid seven of the eleven mentions measured on 2026-08-18 and is the commonest way ' +
      'an agent looks at source at all',
    file: 'src/lib/prevent/obstacles.ts',
    find: "  return MENTION_LINE.test(line) || MENTION_LINE.test(line.replace(GREP_PREFIX, ''));",
    replace: '  return MENTION_LINE.test(line);',
    occurrences: 1,
    run: 'tests/obstacles-mentions.test.ts',
    expect: /grep -n line-number prefix/i,
  },
  {
    name: 'tool-counts-its-own-report-as-a-failure',
    why:
      'the printed obstacle report is captured as a tool result by the session being scanned, ' +
      'so every run re-files what the last run printed and the count climbs on its own — the ' +
      'same lie as the 762x hits number, arriving through a different door',
    file: 'src/lib/prevent/obstacles.ts',
    find: '    if (isOwnReport(raw)) continue;',
    replace: '',
    occurrences: 1,
    run: 'tests/obstacles-mentions.test.ts',
    expect: /ratchets on its own printout|must not read its own report|reinjection brief/i,
  },

  // -- the visible trace, the website claims, and the close gate -------------------
  {
    name: 'trace-wording-drifts-between-the-two-copies',
    why: 'guard.mjs cannot import from src/lib, so the trace exists twice (E-1). Identical numbers with drifted wording is the same defect in slow motion',
    file: 'guard/guard.mjs',
    find: '  return `Enforcee \\u00b7 ${parts.join(\' \\u00b7 \')}`;',
    replace: '  return `Enforcee: ${parts.join(\', \')}`;',
    occurrences: 1,
    run: 'tests/trace-parity.test.ts',
    expect: /a session with every kind of row|a quiet session that only allowed things/,
  },
  {
    name: 'trace-folds-unchecked-into-allowed',
    why: 'a tool call the guard could not inspect is an honest gap; counting it as allowed is a false green',
    file: 'guard/guard.mjs',
    find: "      case 'UNCHECKED': t.unchecked++; break;",
    replace: "      case 'UNCHECKED': t.allowed++; break;",
    occurrences: 1,
    run: 'tests/trace-parity.test.ts',
    expect: /could not read as unchecked, not as clean|a session with every kind of row/,
  },
  {
    name: 'trace-never-reaches-the-user',
    why: 'the summary file would still be written, so the feature would look present on disk while nothing was ever shown',
    file: 'guard/guard.mjs',
    find: '      lines.push(renderTraceLine(trace));',
    replace: '',
    occurrences: 1,
    run: 'tests/trace-parity.test.ts',
    expect: /the guard printed no trace at all/,
  },
  {
    name: 'trace-editorialises',
    why: 'the line the product must not cross: a claim of protection the ledger cannot evidence',
    file: 'src/lib/trace/summary.ts',
    find: "  return `${c.bold('Enforcee')} ${c.grey('\u00b7')} ${parts.join(c.grey(' \u00b7 '))}`;",
    replace: "  return `${c.bold('Enforcee')} ${c.grey('\u00b7')} ${parts.join(c.grey(' \u00b7 '))} ${c.green('\u2014 your project is protected')}`;",
    occurrences: 1,
    run: 'tests/trace.test.ts',
    expect: /the trace editorialises/,
  },
  {
    name: 'trace-absent-guard-reads-as-a-clean-run',
    why: 'a guard that never ran and a session where nothing was blocked produce the same zeros; conflating them turns "not installed" into "all clear"',
    file: 'src/lib/trace/summary.ts',
    find: '  if (mine.length === 0) return { ...EMPTY, blockedBy: [] };',
    replace: '  if (mine.length === 0) return { ...EMPTY, blockedBy: [], empty: false };',
    occurrences: 1,
    run: 'tests/trace.test.ts',
    expect: /says so plainly when nothing was recorded|absent guard must not read as a clean run/,
  },
  {
    name: 'trace-counts-unverifiable-as-confirmed',
    why: 'UNVERIFIABLE is a respected answer; folding it into good news is the failure it exists to prevent',
    file: 'src/lib/trace/summary.ts',
    find: '        else t.unverifiable++;',
    replace: '        else t.confirmed++;',
    occurrences: 1,
    run: 'tests/trace.test.ts',
    expect: /splits claim verdicts three ways/,
  },
  {
    name: 'trace-counts-an-unsettled-criterion-as-verified',
    why: 'a criterion that timed out settled nothing. Counting it as verified makes the number a reader most wants to trust the least trustworthy',
    file: 'src/lib/trace/summary.ts',
    find: '        else t.unsettled++;',
    replace: '        else t.verified++;',
    occurrences: 1,
    run: 'tests/trace.test.ts',
    expect: /both unsettled, not failures|splits the close gate three ways/,
  },
  {
    name: 'trace-verify-counters-drift-between-the-two-copies',
    why: 'the trace exists twice; the close gate rows are the newest place for the two to disagree',
    file: 'guard/guard.mjs',
    find: "        if (r.outcome === 'PASS') t.verified++;",
    replace: "        if (r.outcome === 'PASS') t.allowed++;",
    occurrences: 1,
    run: 'tests/trace-parity.test.ts',
    expect: /a session with every kind of row/,
  },
  {
    name: 'sold-feature-with-no-mechanism',
    why: 'four entitlements were sold on the pricing page and read by nothing. Deleting the declaration must make that visible again',
    file: 'src/lib/plans.ts',
    find: "  driftAlerts:\n    'no detector and no alert.",
    replace: "  driftAlertsRemoved:\n    'no detector and no alert.",
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /driftAlerts is on the pricing page and nothing reads it|Wire it up, or declare it/,
  },
  {
    name: 'unbuilt-feature-back-under-a-green-tick',
    why: 'a tick beside a feature that does not exist is the whole defect',
    file: 'src/lib/plans.ts',
    find: "      'Learn, unlimited',\n    ],",
    replace: "      'Learn, unlimited',\n      'Drift alerts when a rule that used to hold starts failing',\n    ],",
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /ticks driftAlerts, which NOT_YET_BUILT says does not exist/,
  },
  {
    name: 'free-capability-sold-as-a-paid-unlock',
    why: 'the CI gate sat under a green tick on Builder while /faq told anyone who read that far they could have it for nothing',
    file: 'src/lib/plans.ts',
    find: "      'Learn, unlimited',\n    ],",
    replace: "      'Learn, unlimited',\n      'The CI gate: a violated rule fails the pull request',\n    ],",
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /still sells the CI gate, which is free on every plan/,
  },
  {
    name: 'not-gated-flag-quietly-walled-again',
    why: 'declaring something free and then denying it to free is the same contradiction pointing the other way',
    file: 'src/lib/plans.ts',
    find: "    sync: false,\n    ciGate: true,",
    replace: "    sync: false,\n    ciGate: false,",
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /declared NOT_GATED — free to everyone — but the table denies it to free/,
  },
  {
    name: 'entitlement-scan-fooled-by-a-same-named-field',
    why: 'the bare `.attestation` scan matched a field on a signed receipt and pronounced the Founder gate shipped',
    file: 'tests/site-claims.test.ts',
    find: "  const re = new RegExp(`\\\\b(entitlements|ents|ent|e)\\\\.${key}\\\\b`);",
    replace: "  const re = new RegExp(`\\\\.${key}\\\\b`);",
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /same-named field elsewhere was read as an entitlement gate|still explained away in/,
  },
  {
    name: 'destructive-corpus-measured-against-an-unlicensed-guard',
    why: 'an unlicensed guard allows everything and the whole corpus goes green while measuring nothing',
    file: 'tests/site-claims.test.ts',
    find: "    const patched = real.replace(/-----BEGIN PUBLIC KEY-----[\\s\\S]*?-----END PUBLIC KEY-----\\r?\\n/, pubPem);",
    replace: '    const patched = real;',
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /the public key was not found in guard.mjs, so this runs unlicensed/,
  },
  {
    name: 'landing-page-number-drifts-from-the-corpus',
    why: '"10 / 10 destructive commands stopped" was a number nothing measured',
    file: 'src/app/page.tsx',
    find: '<Stat value="10 / 10" label="destructive commands stopped"',
    replace: '<Stat value="14 / 14" label="destructive commands stopped"',
    occurrences: 1,
    run: 'tests/site-claims.test.ts',
    expect: /denominator on the page is not the size of the tested corpus/,
  },
  {
    name: 'close-gate-on-by-default',
    why: 'a gate that can end a turn early must be opted into. "The brief happens to exist" is not consent',
    file: 'guard/guard.mjs',
    find: "  if (policy?.closeGate !== true) return null; // off unless the project turned it on",
    replace: "  if (policy?.closeGate === 'never') return null;",
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /a project that never opted in was blocked|criteria were run without opting in/,
  },
  {
    name: 'close-gate-blocks-forever',
    why: "without the cap a red criterion no further turn can fix becomes an infinite loop that burns somebody's budget",
    file: 'guard/guard.mjs',
    find: '          if (already < 2) {',
    replace: '          if (already < 1000) {',
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /the gate blocked a third time/,
  },
  {
    name: 'close-gate-blames-a-missing-binary',
    why: 'with shell: true a missing binary exits 127 and looks exactly like a red test',
    file: 'guard/guard.mjs',
    find: "    if ((r.status === 127 || r.status === 9009) &&",
    replace: "    if (false &&",
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /a missing binary was recorded as a real failure/,
  },
  {
    name: 'close-gate-calls-an-unfinished-check-a-pass',
    why: 'a check that ran out of time settled nothing; counting it as green is the exact lie this product exists to catch',
    file: 'guard/guard.mjs',
    find: "      results.push({ outcome: 'SLOW', run: a.run, why, detail: `did not finish inside ${perCommand}ms` });",
    replace: "      results.push({ outcome: 'PASS', run: a.run, why, detail: `did not finish inside ${perCommand}ms` });",
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /an unfinished check was recorded as passing/,
  },
  {
    name: 'close-gate-fires-on-sessionend-where-it-cannot-work',
    why: 'SessionEnd is documented as unable to block, so a gate there does nothing while looking like it works',
    file: 'guard/guard.mjs',
    find: "    if (event === 'Stop') {\n      const close = runCloseGate(policy, policyPath);",
    replace: "    if (event === 'Stop' || event === 'SessionEnd') {\n      const close = runCloseGate(policy, policyPath);",
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /never blocks on SessionEnd/,
  },
  {
    name: 'close-gate-ignores-the-expect-string',
    why: 'exit 0 alone is not proof; a criterion that names required output must be held to it',
    file: 'guard/guard.mjs',
    find: "    if (typeof a.expect === 'string' && a.expect && !output.includes(a.expect)) {",
    replace: "    if (false && typeof a.expect === 'string' && a.expect && !output.includes(a.expect)) {",
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /a command that exited 0 without the expected output was accepted/,
  },
  {
    name: 'close-gate-blocks-on-a-criterion-nobody-wrote',
    why: 'no amount of further work makes a missing check pass — blocking on it is a loop with no exit',
    file: 'guard/guard.mjs',
    find: "  const runnable = brief.acceptance.filter((a) => a && typeof a.run === 'string' && a.run.trim());",
    replace: "  const runnable = brief.acceptance.filter((a) => a);",
    occurrences: 1,
    run: 'tests/close-gate.test.ts',
    expect: /a session was sent back over a check that does not exist|a criterion nobody ever wrote|quietly dropped from the report/,
  },
  {
    name: 'second-non-zero-exit-in-the-guard',
    why: 'the never-exit-non-zero rule became a budget of one when the close gate landed. A budget nobody counts is not a budget',
    file: 'guard/guard.mjs',
    find: "  process.stdout.write(JSON.stringify(obj));\n  process.exit(0);",
    replace: "  process.stdout.write(JSON.stringify(obj));\n  process.exit(obj.systemMessage ? 0 : 3);",
    occurrences: 1,
    run: 'tests/invariants.test.ts',
    expect: /is computed, so its value cannot be checked here|exits non-zero in more than one place|a non-zero exit appeared outside the close gate/,
  },
];

const filter = process.argv[2];
const chosen = filter ? SABOTAGES.filter((s) => s.name.includes(filter)) : SABOTAGES;

if (chosen.length === 0) {
  console.error(`no sabotage matches "${filter}". Known: ${SABOTAGES.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

// A harness that selected nothing and reported success is the failure it exists to prevent.
if (!filter && chosen.length < SABOTAGES.length) {
  console.error('the sabotage table lost entries between definition and use');
  process.exit(2);
}

let red = 0;
const misses = [];

for (const s of chosen) {
  const path = join(ROOT, s.file);
  const original = readFileSync(path, 'utf8');

  // 1. THE SABOTAGE MUST APPLY. This is the check that stops a no-op replace from being
  //    reported as a control that held.
  const hits = original.split(s.find).length - 1;
  if (hits !== s.occurrences) {
    misses.push(`${s.name}: NOT APPLIED — found ${hits} occurrence(s) of the anchor, expected ${s.occurrences}`);
    console.log(`✗ ${s.name.padEnd(32)} SABOTAGE DID NOT APPLY (anchor found ${hits}×, expected ${s.occurrences})`);
    continue;
  }
  const broken = original.replace(s.find, s.replace);
  if (broken === original) {
    misses.push(`${s.name}: replacement changed nothing`);
    console.log(`✗ ${s.name.padEnd(32)} SABOTAGE CHANGED NOTHING`);
    continue;
  }

  writeFileSync(path, broken);
  let output = '';
  let exit = 0;
  try {
    output = execFileSync(process.execPath, [VITEST, 'run', s.run, '--reporter=basic'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    exit = e.status ?? 1;
    output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (!output) output = `SPAWN FAILED: ${e.message}`;
  } finally {
    writeFileSync(path, original);
  }

  // 2. RED IS NOT ENOUGH. It has to be red in the named place.
  if (exit === 0) {
    misses.push(`${s.name}: control stayed GREEN with the fix removed — it cannot fail`);
    console.log(`✗ ${s.name.padEnd(32)} STAYED GREEN — not a control`);
  } else if (!s.expect.test(output)) {
    misses.push(`${s.name}: went red, but not at ${s.expect} — possibly a stale or unrelated failure`);
    console.log(`✗ ${s.name.padEnd(32)} red in the WRONG place`);
  } else {
    red++;
    const which = (output.match(/[×✕✗]\s+(.+)/) || [, s.expect.source])[1].trim().slice(0, 88);
    console.log(`✓ ${s.name.padEnd(32)} red: ${which}`);
  }
}

console.log(`\n${red}/${chosen.length} controls proved they can fail. ${SABOTAGES.length} sabotages defined.`);
if (misses.length) {
  console.log('\nNOT PROVEN:');
  for (const m of misses) console.log(`  · ${m}`);
  process.exit(1);
}
