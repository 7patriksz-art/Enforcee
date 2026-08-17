#!/usr/bin/env node
/**
 * The half a test cannot reach: run the doc-claims rules over markdown that is NOT in this
 * repository — the claude.ai project docs, dumped to disk by a scheduled run.
 *
 *   npm run doc-claims -- <docsRoot> [--repo <path>] [--min <claims>]
 *
 * The rules themselves live in `src/lib/doc-claims.ts`, in one copy, and this file is bundled
 * with esbuild before it runs — the same pattern as `licence:repo` and `dogfood`. They are
 * NOT in this file, and they are not in `scripts/`: the first version put them in a
 * `scripts/*.mjs` with a `.d.mts` sidecar and it threw `SyntaxError: Invalid or unexpected
 * token` on windows-latest while passing on ubuntu and macos. See the header of
 * src/lib/doc-claims.ts.
 *
 * `--min` is the coverage floor. A scan of an empty or wrongly-pathed directory reports zero
 * failures, which is indistinguishable from a clean one; below the floor this exits 2.
 * Charter rule 9: a scan that parsed nothing is not a clean scan.
 */
import { scan } from '../src/lib/doc-claims.ts';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i === -1 ? dflt : argv[i + 1];
};
const repoRoot = flag('--repo', process.cwd());
const min = Number(flag('--min', '0'));
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const docsRoot = positional[0] ?? repoRoot;

const { files, results } = scan(docsRoot, repoRoot);
let examined = 0;
let failures = 0;
for (const [rule, r] of Object.entries(results)) {
  examined += r.examined;
  failures += r.missing.length;
  console.log(`${rule}: ${r.examined} examined, ${r.missing.length} unbacked`);
  for (const m of r.missing) console.log(`    ${m}`);
}
console.log(`\nCOVERAGE: ${examined} mechanism claims across ${files.length} markdown files in ${docsRoot}`);
if (examined < min) {
  console.error(`COVERAGE TOO LOW: ${examined} < ${min}. A scan that parsed nothing is not a clean scan.`);
  process.exit(2);
}
console.log(failures ? `${failures} unbacked claim(s).` : 'No unbacked claims.');
process.exit(failures ? 1 : 0);
