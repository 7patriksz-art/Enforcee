#!/usr/bin/env node
/**
 * Issue the licence that turns enforcement ON for this repository.
 *
 * WHY THIS EXISTS AT ALL, given the whole point is not needing Patrik
 *
 * `POST /api/licence` mints licences for *subscribers*: it refuses a caller who is not
 * signed in (401) and refuses `plan === 'free'` (402). Patrik owns the product rather than
 * subscribing to it, so there is no path through that route for this repo — and creating a
 * Stripe subscription for ourselves to get one would put fake revenue in the billing data
 * we make decisions from.
 *
 * So the repo licence is signed directly, with the same key and the same function the server
 * uses. Nothing here is a second implementation: it calls `issueLicence` from
 * `src/lib/licence.ts`, so a change to the format changes this too.
 *
 * THIS SCRIPT HOLDS NO SECRET. It reads `ENFORCEE_LICENCE_PRIVATE_KEY` from the environment,
 * signs one token, prints it, and exits. The key is never written to disk, never logged, and
 * never included in any output — only the signed token is printed, which is what a subscriber
 * would receive anyway. Being in a public repo costs nothing, because without the key it can
 * do nothing.
 *
 *   export ENFORCEE_LICENCE_PRIVATE_KEY="$(cat key.pem)"   # from Vercel → Settings → Env
 *   node scripts/issue-repo-licence.mjs
 *
 * 45 DAYS, DELIBERATELY, AND NOT A DAY MORE
 *
 * D-022: a licence expires at `min(period end, 45 days)`. There is no period end here, so it
 * is 45 days. We do NOT mint ourselves a longer one. An offline licence is verified against a
 * public key on a machine with no network — there is no revocation list and nothing can reach
 * it once issued, so the expiry date is the only control that exists. Special-casing
 * ourselves out of the one control we have would be exactly the quiet reversal
 * `INVARIANTS.md` exists to stop, and it would mean the code path our customers rely on is
 * the one path we never exercise.
 *
 * It expiring is therefore normal and expected. `npm run dogfood` prints the remaining days
 * on every run and warns inside the last week, so it stops loudly rather than silently.
 */
import { issueLicence, verifyLicence, toPrivateKeyPem } from '../src/lib/licence.ts';
import { LICENCE_PUBLIC_KEY } from '../src/lib/licence-key.ts';
import { setLicence, LICENCE_PATHS } from '../src/lib/licence-local.ts';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The package root, found by walking up for package.json rather than by counting `..`.
 *
 * These scripts run BUNDLED — esbuild writes them to `scripts/dist/`, so `import.meta.url`
 * is two levels down, not one. The first version hardcoded `join(here, '..')`, which was
 * correct while the bundle sat in `scripts/` and silently wrong the moment it moved:
 * `dogfood` went looking for `scripts/CLAUDE.md` and died, and the licence script quietly
 * stopped finding `.env.local`. Counting `..` encodes the output directory into the source.
 */
function packageRoot(from) {
  let dir = from;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`Could not find package.json above ${from} — run this through its npm script.`);
}

const ROOT = packageRoot(dirname(fileURLToPath(import.meta.url)));

const TTL_DAYS = 45; // D-022. Raising this is a decision, not a convenience.

/**
 * Finding the private key, without a shell-quoting step that can go wrong.
 *
 * A PKCS#8 Ed25519 key is a multi-line PEM. Getting one into an environment variable by hand
 * differs on every platform — `"$(cat f)"` in bash, `Get-Content f -Raw` in PowerShell (and
 * silently WRONG without `-Raw`, which yields an array) — and it is stored in dashboards as
 * often with literal `\n` as with real newlines. That is four ways for a copy-paste to
 * produce a key that looks right and will not sign.
 *
 * So this looks in several places; `toPrivateKeyPem` in src/lib/licence.ts does the
 * normalising, so this script and the production route agree by construction. In order:
 *
 *   1. --key-file <path>                       an exported PEM, no shell quoting at all
 *   2. ENFORCEE_LICENCE_PRIVATE_KEY            what `vercel env run` injects
 *   3. .env.local, .env.production.local, .env what `vercel env pull` writes
 *
 * The best path needs no copy-paste and touches no disk:
 *
 *   vercel env run -e production -- npm run licence:repo
 */

/** Minimal .env reader: KEY=value, quoted values may span lines. No dependency, no surprises. */
function fromEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const m = text.match(/^ENFORCEE_LICENCE_PRIVATE_KEY=("([\s\S]*?)"|'([\s\S]*?)'|(.*))$/m);
  if (!m) return null;
  const raw = m[2] ?? m[3] ?? m[4] ?? '';
  return raw ? { value: raw, from: path } : null;
}

function findKey(argv) {
  const i = argv.indexOf('--key-file');
  if (i !== -1) {
    const path = argv[i + 1];
    if (!path) return { error: '--key-file needs a path after it.' };
    try {
      return { value: readFileSync(path, 'utf8'), from: path };
    } catch (e) {
      return { error: `--key-file ${path} could not be read: ${e.message}` };
    }
  }
  if (process.env.ENFORCEE_LICENCE_PRIVATE_KEY?.trim()) {
    return { value: process.env.ENFORCEE_LICENCE_PRIVATE_KEY, from: 'ENFORCEE_LICENCE_PRIVATE_KEY' };
  }
  for (const f of ['.env.local', '.env.production.local', '.env']) {
    const hit = fromEnvFile(join(ROOT, f));
    if (hit) return hit;
  }
  return { error: null };
}

const found = findKey(process.argv.slice(2));
if (found.error) {
  console.error(found.error);
  process.exit(1);
}
if (!found.value) {
  console.error('No private key found. Looked in, in order:');
  console.error('  --key-file <path>');
  console.error('  $ENFORCEE_LICENCE_PRIVATE_KEY');
  console.error('  .env.local, .env.production.local, .env');
  console.error('');
  console.error('The key lives in the Vercel project environment. The path that needs no copy-paste');
  console.error('and writes nothing to disk — identical on Windows, macOS and Linux — is:');
  console.error('');
  console.error('  vercel env run -e production -- npm run licence:repo');
  console.error('');
  console.error('If that reports the variable is missing, it was stored as SENSITIVE, which Vercel');
  console.error('cannot read back to anyone. Then the key is gone and the fix is a new keypair:');
  console.error('see docs/LICENCE-KEY.md.');
  process.exit(1);
}

/**
 * Shape-checked by the library, not by a second opinion here.
 *
 * The first version of this demanded PEM armour and refused anything else — so it rejected the
 * key that is actually in Vercel, which is stored as bare base64 DER. `toPrivateKeyPem` is the
 * same normaliser `issueLicence` uses, so this script and `POST /api/licence` can never
 * disagree about what counts as a usable key.
 */
const privateKey = toPrivateKeyPem(found.value);
if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(privateKey)) {
  console.error(`The value from ${found.from} is not a private key in any shape we recognise.`);
  console.error('Expected PEM, or the bare base64 PKCS#8 body with the -----BEGIN----- lines stripped.');
  console.error(`It begins: ${JSON.stringify(found.value.trim().slice(0, 40))}`);
  process.exit(1);
}
console.log(`Key read from ${found.from}.`);

const now = Math.floor(Date.now() / 1000);
const exp = now + TTL_DAYS * 86_400;

let token;
try {
  token = issueLicence({ jti: randomUUID(), sub: 'enforcee-on-enforcee', plan: 'founder', exp }, privateKey);
} catch (e) {
  console.error(`Signing failed: ${e.message}`);
  console.error(`The value from ${found.from} is not a usable PKCS#8 Ed25519 private key.`);
  console.error('A PEM that is well-formed at the ends can still be truncated in the middle.');
  process.exit(1);
}

/**
 * Verify what we just signed, against the SAME public key the CLI compiles in.
 *
 * Not ceremony. If the private key in the environment has been rotated and the public key in
 * `src/lib/licence-key.ts` has not — or the other way round — this signs a token that looks
 * perfect and fails on every machine it is installed on, and the failure surfaces later as
 * "the licence is bad" rather than "the pair does not match". Charter rule: never report a
 * step as done without checking the thing it was supposed to change.
 */
const check = verifyLicence(token, LICENCE_PUBLIC_KEY);
if (!check.ok) {
  console.error(`Signed a licence that does not verify against LICENCE_PUBLIC_KEY: ${check.reason}.`);
  console.error('The private key in the environment and the public key in src/lib/licence-key.ts');
  console.error('are not a pair. Nothing was written. Do not install this token.');
  process.exit(1);
}

console.log('');
console.log(`Licence for ${check.payload.sub} · ${check.payload.plan} · expires ${new Date(exp * 1000).toISOString().slice(0, 10)} (${TTL_DAYS} days)`);
console.log('Verified against the public key the CLI compiles in.');
console.log('');
console.log(token);
console.log('');
/**
 * `--install` writes it, so a long token is never selected out of a terminal by hand.
 *
 * Copying a ~200-character line out of scrollback is a step that fails quietly: a missed
 * leading character produces "that licence did not verify", which reads as a bad licence
 * rather than a bad copy. `setLicence` is the same function `enforcee licence set` uses — it
 * verifies BEFORE writing, so a bad token never lands on disk, and it chmods 0600 where the
 * OS honours it.
 *
 * It installs to `.enforcee/licence` in this repo rather than to the home directory: this
 * licence is issued for THIS repository, `.enforcee/` is gitignored, and a repo-scoped file
 * cannot silently entitle every other project on the machine.
 */
if (process.argv.includes('--install')) {
  const target = join(ROOT, LICENCE_PATHS.project);
  const result = setLicence(token, { path: target });
  if (!result.ok) {
    console.error(`Refusing to install: ${result.reason}`);
    process.exit(1);
  }
  console.log(`Installed to ${result.path}`);
  console.log('');
  console.log('Confirm it with:   npm run dogfood');
  console.log('You should see:    Licensed to enforcee-on-enforcee · founder · 45 days left — enforcement is ON.');
  console.log('');
  console.log('For CI, the same line goes in the ENFORCEE_LICENCE repository secret. It is printed');
  console.log('above; nothing else on this machine needs it.');
} else {
  console.log('Install it — same command on Windows, macOS and Linux, and it verifies before writing:');
  console.log('  npm run licence:repo -- --install');
  console.log('');
  console.log('Or install this exact token yourself:');
  console.log('  node cli/dist/enforcee.mjs licence set "<the line above>"');
  console.log('');
  console.log('For CI, set the line above as the ENFORCEE_LICENCE repository secret. .enforcee/ is');
  console.log('gitignored, so a licence can never be committed to this public repo by accident.');
}
