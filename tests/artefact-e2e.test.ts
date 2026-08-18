import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { issueLicence } from '@/lib/licence';
import { harvest } from './helpers/spawn';

/**
 * THE THING PEOPLE INSTALL, WALKED END TO END.
 *
 * Every other test in this suite imports from `src/`. Users do not have `src/` — they have
 * `npm-dist/`, which `pack-cli.mjs` assembles into a different shape: the CLI moves to
 * `dist/enforcee.mjs` and the guard to `guard/guard.mjs`. That gap is not theoretical:
 *
 *  · the 0.9.0 remote-code-execution path was only severe BECAUSE of the repacking. In the
 *    source tree `../cli/dist/enforcee.mjs` exists, so the honest candidate resolved and the
 *    bug looked like a path-preference issue. In the artefact it does not exist, so the only
 *    resolvable candidate was the attacker-controlled one. `53-SECURITY-AUDIT`: *"Reading
 *    guard.mjs alone would have produced 'a path-resolution bug with a theoretical hostile
 *    case'. Downloading the tarball turned it into 'the only reachable path is the hostile
 *    one'. Audit the artefact, not the tree."*
 *  · the free `audit` reported VIOLATED for "Never use emojis in commit messages" against a
 *    paragraph of prose. Found on 2026-08-17 by installing the tarball into an empty
 *    directory and typing the first command a new user would type. A thousand green tests did
 *    not see it, because every one of them fed the checker an output that was the subject.
 *
 * So this runs the SHIPPED BYTES: `node npm-dist/dist/enforcee.mjs`, the same file `npx
 * enforcee` executes. It deliberately does not `npm install` — that adds a slow, network-shaped
 * step for one extra fact (that package.json's `bin` points where it says), which
 * tests/pack-cli and the publish workflow already establish.
 */

const ROOT = process.cwd();

/**
 * A COPY of npm-dist, never npm-dist itself.
 *
 * The first version of this file swapped a throwaway public key into `npm-dist/` in place, to
 * stand in for a paying customer. That directory is the release candidate. If any step ever
 * published without regenerating it first, we would have shipped a package whose licence key
 * is a test key — anyone could mint a founder licence, and the failure would be invisible from
 * the outside. Today's CI order happens to regenerate it, which is exactly the kind of
 * accidental safety this project keeps discovering it was relying on.
 *
 * So the artefact is copied to a temp directory and the copy is patched. npm-dist is read and
 * never written.
 */
let DIST: string;
let CLI: string;

/** The tracked build artefact pack-cli rewrites, and its committed bytes. */
const TRACKED_BUNDLE = join(process.cwd(), 'cli', 'dist', 'enforcee.mjs');
let committedBundle: Buffer | null = null;

let project: string;
let guard: string;
/** The throwaway signing key behind the test licence, so a second plan can be minted below. */
let testLicenceKey: string;
/**
 * HOME for the signing tests, shared with the stranger tests below.
 *
 * Module scope on purpose. The first version had each describe make its own temp directory
 * and the stranger block went looking for the signer's by scanning `tmpdir()` for a prefix,
 * which found nothing and failed on a path of `undefined` — a test harness inventing a
 * discovery problem it had already been handed the answer to.
 */
let signerHome: string;

const RULES = `# Team rules

- Never run \`git push --force\` against main.
- Never run a recursive delete of a root path.
- Never use emojis.
- Never use emojis in commit messages.
`;

beforeAll(() => {
  // Build the artefact exactly as the release does.
  // Build the release candidate with esbuild directly — never by spawning `npm`, which is a
  // .cmd shim on Windows that Node refuses to execFile (tests/portability.test.ts).
  //
  // pack-cli rebuilds `cli/dist/enforcee.mjs`, which is a TRACKED build artefact. CI has a
  // step asserting that file is not stale, and it compares the working tree against the
  // commit — so a test that rebuilds it turns the tree dirty and fails a check that has
  // nothing to do with this test. Snapshot it and put it back.
  committedBundle = readFileSync(TRACKED_BUNDLE);
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'pack-cli.mjs')], { cwd: ROOT, stdio: 'ignore' });
  const source = join(ROOT, 'npm-dist');
  expect(existsSync(join(source, 'dist', 'enforcee.mjs')), 'pack-cli produced no artefact to test').toBe(true);

  DIST = mkdtempSync(join(tmpdir(), 'enforcee-dist-'));
  cpSync(source, DIST, { recursive: true });
  CLI = join(DIST, 'dist', 'enforcee.mjs');

  project = mkdtempSync(join(tmpdir(), 'enforcee-artefact-'));
  writeFileSync(join(project, 'RULES.md'), RULES);

  // A real licence, against a throwaway keypair swapped into both shipped copies of the
  // public key. Both must be patched: the CLI verifies with its own copy and so does the
  // guard, which is the duplication tests/licence-key-sync.test.ts exists to police.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  testLicenceKey = priv;

  for (const f of [CLI, join(DIST, 'guard', 'guard.mjs')]) {
    const src = readFileSync(f, 'utf8');
    const patched = src.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\r?\n/, pub);
    expect(patched, `the public key was not substituted in ${f}`).not.toBe(src);
    writeFileSync(f, patched);
  }

  mkdirSync(join(project, '.enforcee'), { recursive: true });
  writeFileSync(
    join(project, '.enforcee', 'licence'),
    issueLicence(
      { jti: 'artefact-e2e', sub: 'artefact-test', plan: 'founder', exp: Math.floor(Date.now() / 1000) + 3600 },
      priv
    )
  );
  guard = join(project, '.enforcee', 'guard.mjs');
});

afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
  if (DIST) rmSync(DIST, { recursive: true, force: true });
  // Leave the working tree exactly as it was found.
  if (committedBundle) writeFileSync(TRACKED_BUNDLE, committedBundle);
});

describe('the release candidate itself is never modified by this test', () => {
  it('npm-dist still carries the real licence public key', () => {
    // The control on the safeguard above. If a future edit patches npm-dist in place again,
    // this fails here rather than by shipping a forgeable package.
    // Normalised: a Windows checkout gives the TypeScript source CRLF endings while esbuild
    // writes the bundle with LF, so a raw comparison fails on windows-latest only. Third
    // instance of this exact class today; .gitattributes covers the guard, not src/.
    const lf = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const shipped = lf(join(ROOT, 'npm-dist', 'dist', 'enforcee.mjs'));
    const real = lf(join(ROOT, 'src', 'lib', 'licence-key.ts')).match(
      /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/
    );
    expect(real, 'could not read the real public key from source').not.toBeNull();
    expect(shipped, 'npm-dist no longer carries the real licence key — a test key may have leaked into the release candidate').toContain(
      real![0]
    );
  });
});

function cli(...args: string[]): { out: string; code: number } {
  try {
    return {
      out: execFileSync(process.execPath, [CLI, ...args], { cwd: project, encoding: 'utf8' }),
      code: 0,
    };
  } catch (e) {
    const h = harvest(e);
    return { out: h.output, code: h.code ?? -1 };
  }
}

function hook(command: string): { out: string; code: number } {
  const payload = JSON.stringify({
    cwd: project,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    session_id: 'artefact-e2e',
  });
  try {
    return { out: execFileSync(process.execPath, [guard], { input: payload, encoding: 'utf8', cwd: project }), code: 0 };
  } catch (e) {
    const h = harvest(e);
    return { out: h.output, code: h.code ?? -1 };
  }
}

describe('the free tier works out of the box, and does not lie', () => {
  it('audits an output and reports real verdicts', () => {
    writeFileSync(join(project, 'answer.md'), 'I shipped it. 🎉\n');
    const { out } = cli('audit', 'RULES.md', 'answer.md');
    expect(out, 'the audit produced no verdicts at all').toMatch(/VIOLATED|FOLLOWED|UNVERIFIABLE/);
  });

  it('does NOT accuse prose of breaking a commit-message rule', () => {
    // The exact false accusation found by doing this by hand on 2026-08-17. It is asserted
    // against the shipped bytes rather than against src/, because that is where it was seen.
    writeFileSync(join(project, 'answer.md'), 'I shipped it. 🎉\n');
    const { out } = cli('audit', 'RULES.md', 'answer.md');
    const commitLine = out.split('\n').find((l) => /in commit messages/.test(l)) ?? '';
    expect(commitLine, 'the commit-message rule is missing from the report entirely').not.toBe('');
    expect(commitLine, 'the shipped CLI accuses prose of a commit-message violation').not.toMatch(/VIOLATED/);
  });

  it('but still catches the unscoped rule, so this is not a silencer', () => {
    writeFileSync(join(project, 'answer.md'), 'I shipped it. 🎉\n');
    const { out } = cli('audit', 'RULES.md', 'answer.md');
    const bare = out.split('\n').find((l) => /Never use emojis\.\s*$/.test(l)) ?? '';
    expect(bare, 'the unscoped emoji rule is missing from the report').not.toBe('');
    expect(bare, 'a real emoji violation was let through').toMatch(/VIOLATED/);
  });
});

describe('the licensed guard actually blocks, which is the whole product', () => {
  it('compiles a policy from the ruleset', () => {
    const { out } = cli('guard', 'RULES.md');
    expect(out, 'the licensed guard command refused a valid licence').not.toMatch(/part we charge for/i);
    expect(out).toMatch(/blocking/);
    expect(existsSync(join(project, '.enforcee', 'policy.json')), 'no policy.json was written').toBe(true);
    expect(existsSync(guard), 'no runnable guard was written').toBe(true);

    // The written guard carries the shipped public key, so it needs the test key too.
    const src = readFileSync(guard, 'utf8');
    const pub = readFileSync(CLI, 'utf8').match(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\n/)![0];
    writeFileSync(guard, src.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\r?\n/, pub));
  });

  it('DENIES a force push', () => {
    const { out } = hook('git push --force origin main');
    expect(out, 'a force push was not denied — the product does not do its one job').toMatch(/"permissionDecision":"deny"/);
    expect(out, 'denied without naming the rule that did it').toMatch(/Blocked by Enforcee rule/);
  });

  it('DENIES a recursive delete of a root path', () => {
    expect(hook('rm -rf /').out).toMatch(/"permissionDecision":"deny"/);
  });

  it('lets an ordinary command through, so it is not just refusing everything', () => {
    // Without this the two tests above are satisfied by a guard that denies unconditionally,
    // which would be worse than no guard.
    const { out } = hook('npm test');
    expect(out, 'an ordinary command was blocked').not.toMatch(/"permissionDecision":"deny"/);
  });
});

describe('and it is honest about what it has not done', () => {
  it('status reports no recorded decisions before the guard has run in a fresh project', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'enforcee-fresh-'));
    try {
      const out = execFileSync(process.execPath, [CLI, 'status'], { cwd: fresh, encoding: 'utf8' });
      expect(out, 'status claims something is installed in an empty directory').toMatch(
        /not registered|missing|NO DECISIONS RECORDED/i
      );
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });
});

/**
 * THE FOUNDER CLAIM, WALKED FROM BOTH ENDS.
 *
 * `enforcee.com/pricing` has sold *"Signed receipts you can hand to a client"* on the $290/year
 * tier since 11 August. `src/lib/attest.ts` and fourteen green tests existed the whole time and
 * the only importer of `attest()` in the repository was its own test file — a mirror, not a
 * control. This is the half a unit test cannot reach: the shipped bytes, a real licence, and
 * then the same bytes run by somebody with no licence at all, which is what a client is.
 */
describe('signed receipts: the Founder tier can produce one', () => {
  const receiptPath = () => join(project, 'receipt.json');
  const signedPath = () => join(project, 'receipt.signed.json');
  const pubKeyPath = () => join(signerHome, '.enforcee', 'attestation-key.pub');

  beforeAll(() => {
    signerHome = mkdtempSync(join(tmpdir(), 'enforcee-signhome-'));
  });

  /** Same as cli(), with HOME redirected so the test never touches the real ~/.enforcee. */
  const signCli = (...args: string[]): { out: string; code: number } => {
    try {
      return {
        out: execFileSync(process.execPath, [CLI, ...args], {
          cwd: project,
          encoding: 'utf8',
          env: { ...process.env, HOME: signerHome, USERPROFILE: signerHome },
        }),
        code: 0,
      };
    } catch (e) {
      const h = harvest(e);
      return { out: h.output, code: h.code ?? -1 };
    }
  };

  it('produces a receipt to sign', () => {
    writeFileSync(join(project, 'answer.md'), 'I shipped it.\n');
    const { out } = signCli('audit', 'RULES.md', 'answer.md', '--json');
    writeFileSync(receiptPath(), out);
    expect(JSON.parse(out).results.length, 'the audit graded nothing, so the rest of this file proves nothing').toBeGreaterThan(0);
  });

  it('makes a signing key, and refuses to overwrite it', () => {
    expect(signCli('sign', 'keygen').out).toMatch(/Signing key written/);
    expect(existsSync(pubKeyPath()), 'no public key was written to publish').toBe(true);
    const again = signCli('sign', 'keygen');
    expect(again.code, 'a second keygen silently destroyed every receipt ever signed').not.toBe(0);
    expect(again.out).toMatch(/refusing to overwrite/);
  });

  it('signs the receipt', () => {
    const { out, code } = signCli('sign', 'receipt.json');
    expect(code, `signing failed: ${out}`).toBe(0);
    expect(out).toMatch(/Signed —/);
    expect(existsSync(signedPath()), 'nothing was written').toBe(true);
    expect(JSON.parse(readFileSync(signedPath(), 'utf8')).attestation.signature).toBeTruthy();
  });
});

/**
 * The other end. No licence, no account, no network — a stranger with a file and a key.
 *
 * `check` is deliberately ungated. A client who must buy a subscription to read the receipt you
 * handed them has not been given evidence, they have been given an advert.
 */
describe('signed receipts: a stranger with no licence can check one', () => {
  let stranger: string;
  let home: string;

  beforeAll(() => {
    stranger = mkdtempSync(join(tmpdir(), 'enforcee-stranger-'));
    home = mkdtempSync(join(tmpdir(), 'enforcee-strangerhome-'));
    // Everything they were given, and nothing else.
    cpSync(join(project, 'receipt.signed.json'), join(stranger, 'receipt.signed.json'));
    cpSync(join(signerHome, '.enforcee', 'attestation-key.pub'), join(stranger, 'supplier.pub'));
    expect(existsSync(join(stranger, '.enforcee')), 'the stranger has a licence, which defeats the point').toBe(false);
  });
  afterAll(() => {
    for (const d of [stranger, home, signerHome]) if (d) rmSync(d, { recursive: true, force: true });
  });

  const check = (...args: string[]): { out: string; code: number } => {
    try {
      return {
        out: execFileSync(process.execPath, [CLI, 'check', ...args], {
          cwd: stranger,
          encoding: 'utf8',
          // ENFORCEE_LICENCE is stripped: inheriting one from the environment would make an
          // ungated command look ungated while actually being licensed.
          env: { ...process.env, HOME: home, USERPROFILE: home, ENFORCEE_LICENCE: '' },
        }),
        code: 0,
      };
    } catch (e) {
      const h = harvest(e);
      return { out: h.output, code: h.code ?? -1 };
    }
  };

  it('says VALID, and exits 0, with no licence anywhere', () => {
    const { out, code } = check('receipt.signed.json', '--key', 'supplier.pub');
    expect(out, 'the free check demanded a licence').not.toMatch(/part we charge for|licence/i);
    expect(out).toMatch(/VALID/);
    expect(code, `a genuine receipt did not pass: ${out}`).toBe(0);
  });

  it('prints what it does NOT prove, every time', () => {
    expect(check('receipt.signed.json', '--key', 'supplier.pub').out).toMatch(/ran against the code you were shipped/);
  });

  it('REFUTES a receipt with one character changed, and exits 1', () => {
    // The observable this whole feature was specified against: fail on a body edited by one
    // character. Everything else here is satisfied by a command that always says VALID.
    const doc = JSON.parse(readFileSync(join(stranger, 'receipt.signed.json'), 'utf8'));
    const target = doc.receipt.results[0];
    target.verdict = target.verdict === 'FOLLOWED' ? 'VIOLATED' : 'FOLLOWED';
    writeFileSync(join(stranger, 'tampered.json'), JSON.stringify(doc));

    const { out, code } = check('tampered.json', '--key', 'supplier.pub');
    expect(out, 'an edited receipt was accepted').toMatch(/REFUTED/);
    expect(out).toMatch(/altered since it was written/);
    expect(code, 'an edited receipt did not fail the exit code').toBe(1);
  });

  it('says UNVERIFIABLE — not REFUTED — when it is handed the wrong kind of key, and exits 4', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(join(stranger, 'wrong-kind.pub'), publicKey.export({ type: 'spki', format: 'pem' }).toString());
    const { out, code } = check('receipt.signed.json', '--key', 'wrong-kind.pub');
    expect(out, 'a client holding the wrong key file was told the supplier forged the receipt').not.toMatch(/REFUTED/);
    expect(out).toMatch(/UNVERIFIABLE/);
    expect(code).toBe(4);
  });

  it('refuses to answer at all without a key', () => {
    const { out, code } = check('receipt.signed.json');
    expect(out).toMatch(/--key is required/);
    expect(code).toBe(2);
  });
});

/** The gate itself, proved able to refuse. */
describe('signed receipts: signing is Founder, and the wall is real', () => {
  it('a Builder licence cannot sign', () => {
    const builderProject = mkdtempSync(join(tmpdir(), 'enforcee-builder-'));
    const home = mkdtempSync(join(tmpdir(), 'enforcee-builderhome-'));
    try {
      mkdirSync(join(builderProject, '.enforcee'), { recursive: true });
      writeFileSync(
        join(builderProject, '.enforcee', 'licence'),
        issueLicence(
          { jti: 'builder-e2e', sub: 'builder-test', plan: 'builder', exp: Math.floor(Date.now() / 1000) + 3600 },
          testLicenceKey
        )
      );
      cpSync(join(project, 'receipt.json'), join(builderProject, 'receipt.json'));

      let out = '';
      let code = 0;
      try {
        out = execFileSync(process.execPath, [CLI, 'sign', 'receipt.json'], {
          cwd: builderProject,
          encoding: 'utf8',
          env: { ...process.env, HOME: home, USERPROFILE: home, ENFORCEE_LICENCE: '' },
        });
      } catch (e) {
        const h = harvest(e);
        out = h.output;
        code = h.code ?? -1;
      }
      expect(code, 'a Builder licence was allowed to sign, which gives away the Founder tier').toBe(3);
      expect(out, 'the refusal did not say which plan is needed').toMatch(/Founder/);
      expect(existsSync(join(builderProject, 'receipt.signed.json')), 'it refused and signed anyway').toBe(false);
    } finally {
      for (const d of [builderProject, home]) rmSync(d, { recursive: true, force: true });
    }
  });
});
