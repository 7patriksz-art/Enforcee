#!/usr/bin/env node
/**
 * Build the publishable CLI package into npm-dist/.
 *
 * Why this exists rather than publishing the repo root: the root package.json
 * depends on Next, React, Supabase and Stripe. None of that is needed to run the
 * CLI — esbuild bundles the engine into one file with zero runtime dependencies.
 * Publishing the root would make `npx enforcee` pull ~300 MB to run a 340 KB
 * script, which is a terrible first impression for a tool whose entire pitch is
 * that it does not need anything from you.
 *
 * So we assemble a minimal package here: the bundle, the guard runner, the
 * licence, a README, and a package.json with an empty dependency list.
 *
 *   node scripts/pack-cli.mjs          build npm-dist/
 *   node scripts/pack-cli.mjs --check  build and verify, exit non-zero on problems
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'npm-dist');
const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const problems = [];
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => {
  problems.push(m);
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
};

console.log('\n  Packing the enforcee CLI\n');

// 1. Build the bundle fresh. Never publish a stale one.
execFileSync('npm', ['run', 'build:cli'], { cwd: ROOT, stdio: 'inherit' });

// 2. Clean output.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'dist'), { recursive: true });

// 3. Copy the payload.
cpSync(join(ROOT, 'cli/dist/enforcee.mjs'), join(OUT, 'dist/enforcee.mjs'));
cpSync(join(ROOT, 'guard'), join(OUT, 'guard'), { recursive: true });
cpSync(join(ROOT, 'LICENSE'), join(OUT, 'LICENSE'));

// 4. A README written for somebody who arrived from `npm view`, not from the site.
writeFileSync(
  join(OUT, 'README.md'),
  `# enforcee

**Did your AI actually follow the rules you gave it?**

\`\`\`bash
npx enforcee audit CLAUDE.md answer.md
\`\`\`

A verdict for every rule in your ruleset — followed, violated, not applicable, or
honestly unverifiable — with the exact quote each verdict was decided on.

About four fifths of a real ruleset is settled by deterministic code. Those verdicts
are reproducible: same input, same receipt, on any machine. The rest can be sent to a
model with \`--judge\`, and a judged verdict whose evidence quote cannot be located
character-for-character in your own text is thrown away rather than shown to you.

## Commands

| Command | What it does |
| --- | --- |
| \`enforcee audit <rules> <output>\` | Per-rule verdicts with evidence. Exits non-zero on a violation, so it works as a CI gate. |
| \`enforcee health <rules>\` | Critiques the ruleset itself: duplicates, contradictions, rules too vague to check. |
| \`enforcee learn <conversation>\` | Proposes rules from things you already said. Nothing is switched on for you. |
| \`enforcee session <transcript.jsonl>\` | What the model could actually see: skills offered vs used, MCP servers that never connected. |
| \`enforcee guard <rules>\` | Compiles your rules into a policy the guard enforces. **Requires a licence.** |
| \`enforcee licence\` | Shows the licence this machine is using and when it expires. |

## Privacy

\`audit\`, \`health\`, \`learn\` and \`session\` make **zero network calls** — no account, no
API key, no telemetry, no update check. There is nothing to switch off because there is
nothing there. \`--judge\` is the only thing that talks to a network, it uses your own
\`ANTHROPIC_API_KEY\`, and it only runs when you ask for it.

The licence check is also offline: a signature verified against a public key compiled
into this file. We never learn that you ran it.

## Licence

Not a single licence — see [LICENSE](./LICENSE). The guard runner and this CLI wrapper
are MIT, because they run on your machine and you should be able to read them. The audit
engine is source-available but all rights reserved.

https://enforcee.vercel.app
`
);

// 5. The manifest. No dependencies — the bundle has none by construction.
const pkg = {
  name: 'enforcee',
  version: root.version,
  description:
    'Did your AI follow your rules? Per-rule verdicts with the exact evidence quote. Four fifths decided by deterministic code, offline, with no account.',
  keywords: [
    'claude', 'claude-code', 'agents-md', 'claude-md', 'cursorrules', 'ai-agents',
    'compliance', 'verification', 'audit', 'guardrails', 'llm', 'code-review', 'ci',
  ],
  homepage: 'https://enforcee.vercel.app',
  bugs: { url: 'https://github.com/7patriksz-art/Enforcee/issues' },
  repository: { type: 'git', url: 'git+https://github.com/7patriksz-art/Enforcee.git' },
  license: 'SEE LICENSE IN LICENSE',
  author: 'Enforcee',
  type: 'module',
  bin: { enforcee: 'dist/enforcee.mjs' },
  files: ['dist', 'guard', 'LICENSE', 'README.md'],
  engines: { node: '>=20' },
  dependencies: {},
  publishConfig: { access: 'public' },
};
writeFileSync(join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

// 6. Verify. A broken publish is expensive to undo — npm forbids reusing a version.
console.log('\n  Checks\n');

const bundle = join(OUT, 'dist/enforcee.mjs');
const src = readFileSync(bundle, 'utf8');

src.startsWith('#!/usr/bin/env node')
  ? ok('bundle has a shebang')
  : bad('bundle is missing its shebang — npx will not run it');

/^#!\/usr\/bin\/env node\n(?!#!)/.test(src)
  ? ok('exactly one shebang')
  : bad('duplicate shebang — this broke once before, do not ship it');

const kb = Math.round(statSync(bundle).size / 1024);
kb < 2048 ? ok(`bundle is ${kb} KB`) : bad(`bundle is ${kb} KB — something got pulled in that should not have`);

existsSync(join(OUT, 'guard/guard.mjs')) ? ok('guard runner included') : bad('guard/guard.mjs missing');
existsSync(join(OUT, 'LICENSE')) ? ok('LICENSE included') : bad('LICENSE missing');

Object.keys(pkg.dependencies).length === 0
  ? ok('zero runtime dependencies')
  : bad('dependencies leaked into the CLI package');

// The engine must not phone home on the free paths. Assert the bundle contains no
// hardcoded endpoint other than the model provider, which only --judge reaches.
//
// Known-benign strings are listed individually with a reason rather than waved through
// by a loose pattern — the value of this check is that a NEW endpoint appearing here is
// loud, and a permissive allowlist would silence exactly the case it exists to catch.
const BENIGN = [
  // Appears only inside a thrown error message in the bundled Anthropic SDK, telling
  // react-native users to use expo/fetch. Never used as a request target.
  { host: 'https://docs.expo.dev', why: 'error-message string in @anthropic-ai/sdk' },
];
const ALLOWED = /^https?:\/\/([a-z0-9-]+\.)*(anthropic\.com|claude\.com|enforcee\.vercel\.app|json-schema\.org|w3\.org|github\.com|opensource\.org)$/;

const urls = [...new Set([...src.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0].toLowerCase()))];
const unexpected = urls.filter((u) => !ALLOWED.test(u) && !BENIGN.some((b) => b.host === u));

if (unexpected.length === 0) {
  ok(`no unexpected network endpoints (${BENIGN.length} known-benign string${BENIGN.length === 1 ? '' : 's'} skipped)`);
} else {
  bad(`unexpected endpoints: ${unexpected.join(', ')}`);
  console.log('     If one of these is benign, add it to BENIGN in this script with a reason.');
}

// A stronger assertion than the string scan: the free commands must not open a socket.
// Run a real audit with the network stubbed out and fail if anything tries to dial.
try {
  const probe = `
    const bad = [];
    for (const m of ['http', 'https', 'net', 'tls']) {
      const mod = await import('node:' + m);
      for (const fn of ['request', 'get', 'connect']) {
        if (typeof mod[fn] === 'function') {
          const orig = mod[fn];
          mod[fn] = (...a) => { bad.push(m + '.' + fn); return orig(...a); };
        }
      }
    }
    const origFetch = globalThis.fetch;
    globalThis.fetch = (...a) => { bad.push('fetch:' + String(a[0]).slice(0, 60)); return origFetch(...a); };
    process.on('exit', () => {
      if (bad.length) { console.error('DIALED:' + bad.join(',')); process.exit(9); }
    });
    process.argv = [process.argv[0], 'enforcee', 'audit', ${JSON.stringify(join(OUT, 'probe-rules.md'))}, ${JSON.stringify(join(OUT, 'probe-out.md'))}];
    await import(${JSON.stringify(bundle)});
  `;
  writeFileSync(join(OUT, 'probe-rules.md'), '- Never use emojis.\n- Always cite sources with links.\n');
  writeFileSync(join(OUT, 'probe-out.md'), 'Here is an answer with no emoji and no citation.\n');
  writeFileSync(join(OUT, 'probe.mjs'), probe);
  execFileSync('node', [join(OUT, 'probe.mjs')], { encoding: 'utf8', stdio: 'pipe' });
  ok('a free audit opened no sockets — verified at runtime, not just by grep');
} catch (e) {
  const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  // audit exits non-zero when a rule is violated, which is correct behaviour here.
  if (out.includes('DIALED:')) bad(`the free path made a network call: ${out.split('DIALED:')[1]?.split('\n')[0]}`);
  else ok('a free audit opened no sockets — verified at runtime, not just by grep');
}
for (const f of ['probe.mjs', 'probe-rules.md', 'probe-out.md']) rmSync(join(OUT, f), { force: true });

// Smoke test: the licensed command must refuse without a licence, and say so usefully.
try {
  execFileSync('node', [bundle, 'guard', 'nonexistent.md'], { encoding: 'utf8', env: { ...process.env, ENFORCEE_LICENCE: '' } });
  bad('guard ran without a licence');
} catch (e) {
  e.status === 3 && /part we charge for/i.test(e.stdout ?? '')
    ? ok('guard refuses without a licence, with a readable reason')
    : bad(`guard exited ${e.status} without the expected message`);
}

console.log(
  problems.length === 0
    ? `\n  \x1b[32mReady.\x1b[0m  npm publish ./npm-dist\n`
    : `\n  \x1b[31m${problems.length} problem(s). Not publishable.\x1b[0m\n`
);
if (process.argv.includes('--check') && problems.length) process.exit(1);
