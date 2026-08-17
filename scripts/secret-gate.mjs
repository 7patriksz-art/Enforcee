#!/usr/bin/env node
/**
 * CLI for the credential gate. `scripts/push.sh` runs this before every push, outside the
 * SKIP_CHECKS branch, and refuses to push when it exits non-zero. THIS REPOSITORY IS PUBLIC.
 *
 * The rules live in `src/lib/secret-gate.ts`, in one copy, and this file is bundled with
 * esbuild before it runs — the same pattern as `licence:repo`, `dogfood` and `doc-claims`.
 * They are NOT in this file and not anywhere under `scripts/`: a test importing a
 * `scripts/*.mjs` threw `SyntaxError` on windows-latest on 2026-08-17, and
 * `tests/portability.test.ts` now bans the shape.
 *
 *   npm run secret-gate               scan origin/<branch>..HEAD
 *   npm run secret-gate -- <range>    scan an explicit range
 *   npm run secret-gate -- --text -   read text on stdin (used by the tests)
 *
 * Exit 0 clean, 1 found something, 2 the gate itself could not run — which is NOT a pass.
 */
import { readFileSync } from 'node:fs';
import { findCredentials, findInDiff, outgoingDiff } from '../src/lib/secret-gate.ts';

const argv = process.argv.slice(2);
const isText = argv[0] === '--text';
let text;

if (isText) {
  text = argv[1] === '-' ? readFileSync(0, 'utf8') : (argv[1] ?? '');
} else {
  try {
    text = outgoingDiff(argv[0]);
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}` || `SPAWN FAILED: ${e.message}`;
    console.error(`secret-gate could not read the commits it is supposed to scan:\n${out}`);
    process.exit(2);
  }
}

const literal = process.env.PAT && process.env.PAT.trim() ? process.env.PAT.trim() : undefined;
// --text mode has no file attribution, so nothing is exempt there: the tests exercise the
// strict path, and the real push path goes through findInDiff.
const hits = isText ? findCredentials(text, literal) : findInDiff(text, literal);

if (hits.length === 0) {
  console.log(
    `secret-gate: clean — ${text.length} chars scanned${literal ? ', including an exact match on $PAT' : ''}`
  );
  process.exit(0);
}

console.error('');
console.error('SECRET GATE: refusing to push. This repository is PUBLIC.');
console.error('');
for (const h of hits) console.error(`  · ${h.what}: ${h.masked}${h.file ? `  [${h.file}]` : '  [commit message]'}`);
console.error('');
console.error('A credential in a public repo is live the moment it lands, and the first thing');
console.error('it can do is push. Rewrite the commit — removing it in a LATER commit does not');
console.error('help, the object stays reachable:');
console.error('');
console.error('  git reset --soft HEAD~1   # then unstage the offending file and recommit');
console.error('');
console.error('Then ROTATE the credential anyway if it ever reached a commit object.');
process.exit(1);
