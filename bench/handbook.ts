/**
 * Enforcee against the HANDBOOK.md corpus (arXiv 2607.25398, github.com/surge-ai/handbook).
 *
 * WHAT THIS IS NOT. HANDBOOK grades an agent's *actions* inside a Docker environment —
 * files written, emails sent, Slack messages posted. Enforcee grades a *text output*
 * against a *ruleset*. Its 824 rubrics are therefore not a gold set for our judge, and the
 * act plan's assumption that they were is wrong. Publishing a precision/recall number
 * against them would be comparing two different things and calling it validation.
 *
 * WHAT IT IS. The corpus ships 65 standard operating procedures, 20–124 pages each, written
 * as real enterprise policy rather than as test fixtures. That makes it the best available
 * answer to the question our own gold set cannot answer honestly:
 *
 *   on somebody else's real rulesets, what share do we decide by code alone?
 *
 * The ~80% figure comes from rulesets we wrote. This one does not. If it drops sharply on
 * real policy documents, that is the number worth knowing before anybody publishes 80%.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseRuleset, classify } from '../src/lib/rules/parse';

const ROOT = '/tmp/handbook/tasks';

/** Crude but honest HTML → text. No dependency, and the SOPs are plain document HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n');
}

function findSops(): string[] {
  const out: string[] = [];
  for (const task of readdirSync(ROOT)) {
    const ws = join(ROOT, task, 'environment/initial_workspace');
    let entries: string[] = [];
    try { entries = readdirSync(ws); } catch { continue; }
    for (const f of entries) {
      if (!/\.html$/i.test(f)) continue;
      if (!/sop|handbook|policy|procedure/i.test(f)) continue;
      out.push(join(ws, f));
    }
  }
  return [...new Set(out)];
}

const files = findSops();
let totalRules = 0;
let deterministic = 0;
const kinds = new Map<string, number>();
const perFile: { name: string; kb: number; rules: number; det: number }[] = [];
const sample: string[] = [];
let ruleLike = 0;
let noise = 0;

for (const f of files) {
  const text = htmlToText(readFileSync(f, 'utf8'));
  const { rules } = parseRuleset(text, f);
  let det = 0;
  for (const r of rules) {
    const c = classify(r.text);
    const kind = (c as { kind?: string } | null)?.kind ?? 'none';
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    // 'judged' is what classify returns when it CANNOT decide by code. Counting it as
    // deterministic is how this script first reported 100%, which was nonsense and worth
    // recording: the bug flattered us, which is the direction bugs are least likely to be
    // questioned.
    if (kind !== 'none' && kind !== 'judged') det++;
    if (sample.length < 8 && Math.abs(Math.sin(totalRules + sample.length * 97)) > 0.995) {
      sample.push(`[${kind}] ${r.text.slice(0, 96).replace(/\s+/g, ' ')}`);
    }
  }
  // How many of these are rules at all? A real obligation carries a modal — must, never,
  // shall, required, do not. A table-of-contents line does not. Without this split the
  // deterministic share is measured against a denominator full of headings.
  for (const r of rules) {
    if (/\b(must|must not|never|always|shall|shall not|required to|do not|don't|may not|prohibited|ensure that|is required)\b/i.test(r.text)) ruleLike++;
    if (/^\s*[\w .]{0,60}\.{6,}/.test(r.text) || /^#{1,6}\s/.test(r.text) || r.text.trim().split(/\s+/).length < 4) noise++;
  }
  totalRules += rules.length;
  deterministic += det;
  perFile.push({ name: f.split('/').pop()!, kb: Math.round(statSync(f).size / 1024), rules: rules.length, det });
}

console.log(`\n  HANDBOOK.md corpus — ${files.length} SOP documents (HTML subset)\n`);
for (const p of perFile.sort((a, b) => b.rules - a.rules).slice(0, 10)) {
  const pct = p.rules ? Math.round((p.det / p.rules) * 100) : 0;
  console.log(`    ${String(p.rules).padStart(4)} rules  ${String(pct).padStart(3)}% by code  ${p.kb}KB  ${p.name.slice(0, 46)}`);
}
console.log('\n  --- a random sample of what was extracted, to check these are rules at all ---');
for (const s2 of sample) console.log(`    ${s2}`);
console.log(`\n  TOTAL rules extracted     ${totalRules}`);
console.log(`  Decided by code alone     ${deterministic}  (${((deterministic / totalRules) * 100).toFixed(1)}%)`);
console.log(`  Would need the judge      ${totalRules - deterministic}`);
console.log(`\n  Of those extracted:`);
console.log(`    carry an obligation word  ${ruleLike}  (${((ruleLike / totalRules) * 100).toFixed(1)}%)`);
console.log(`    obvious non-rules         ${noise}  (headings, ToC lines, fragments)`);
console.log(`\n  Deterministic share measured ONLY on obligation-bearing lines:`);
console.log(`    ${deterministic} / ${ruleLike} = ${((deterministic / Math.max(1, ruleLike)) * 100).toFixed(1)}%\n`);
console.log('  check kinds:');
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(n).padStart(5)}  ${k}`);
}

// ── Why the deterministic share is low, which is the finding that matters ──────────────
//
// Cleaning up extraction moved 4,761 -> 4,461 and left 19.4% exactly where it was. That is
// the answer: the low number is not a measurement artefact, it is what our checkers cover.
//
// Our 16 deterministic checks are about the SHAPE OF TEXT — emoji, em-dashes, word counts,
// JSON validity, markdown tables, citations, required and forbidden literals. Real
// enterprise rules are about WHETHER SOMETHING HAPPENED: escalate within 24 hours, verify
// the W-9 before payment, obtain a second approval above a threshold. No amount of reading
// an output can settle those. They are not judged-vs-deterministic; they are unanswerable
// from text alone.
console.log('\n  --- what the un-decidable rules are actually asking for ---');
const ACTION = /\b(escalate|notify|approve|verify|confirm|obtain|submit|file|record|log|route|assign|review|sign|archive|retain|within \d+|no later than|prior to|before proceeding)\b/i;
let actionShaped = 0;
for (const f of files) {
  const { rules } = parseRuleset(htmlToText(readFileSync(f, 'utf8')), f);
  for (const r of rules) {
    const kind = (classify(r.text) as { kind?: string } | null)?.kind ?? 'none';
    if (kind === 'judged' && ACTION.test(r.text)) actionShaped++;
  }
}
console.log(`    ask whether an ACTION occurred   ${actionShaped}`);
console.log(`    (a text output cannot settle these at all — they need the environment)\n`);
