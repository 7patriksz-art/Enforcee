import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

/**
 * The conversion pipeline, and the ways it rots.
 *
 * A funnel decays in a specific direction: every individual change makes the pitch a
 * little louder, a little earlier, and a little less true, and no single one of them looks
 * wrong in review. Six months later the free tool is buried under three banners and the
 * offer no longer depends on what the user's data said.
 *
 * These are the rules the pipeline was built to, expressed as controls so a later session
 * — human or the daily agent — cannot quietly relax them.
 *
 * The state before this: THREE promotional notes stacked ABOVE the receipt, at the single
 * highest-intent moment in the product, all three linking to the same page in three
 * different voices.
 */

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Source with comments stripped — several files explain a past bug by naming it. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'npm-dist', 'theme-audit', 'dist'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const pages = walk(join(ROOT, 'src', 'app')).filter((f) => f.endsWith('page.tsx'));

describe('the result comes before the pitch', () => {
  const audit = read(join('src', 'app', 'audit', 'page.tsx'));

  it('nothing links to pricing above the receipt', () => {
    // The load-bearing one. A visitor who has just run their first audit must reach the
    // verdicts without being sold to on the way.
    const receiptAt = audit.indexOf('<ReceiptView');
    expect(receiptAt, 'no ReceiptView to order against').toBeGreaterThan(-1);
    const above = audit.slice(0, receiptAt);
    expect(above, 'a pricing link sits above the audit result').not.toMatch(/href="\/pricing"/);
  });

  it('offers exactly one next step, not a stack of notes', () => {
    const receiptAt = audit.indexOf('<ReceiptView');
    const below = audit.slice(receiptAt);
    // One component owns the whole post-result moment. Counting `<NextStep` rather than
    // links, because the failure mode is additive: someone appends a second banner beside
    // it rather than editing the first.
    expect((below.match(/<NextStep/g) ?? []).length).toBe(1);
    expect((audit.match(/href="\/pricing"/g) ?? []).length, 'pricing links on /audit').toBe(0);
  });
});

describe('the offer is derived from the audit, not generic', () => {
  const next = read(join('src', 'components', 'NextStep.tsx'));

  it('reads the receipt rather than showing one fixed message', () => {
    expect(next).toContain('receipt.summary');
    expect(next).toContain("verdict === 'VIOLATED'");
    // The enforceable count must be a SUBSET of the violated rows. Counting anything else
    // produced the literal string "16 of 2 could have been refused" on a rendered page —
    // caught by driving a real audit in a browser, not by any static check.
    expect(next, 'enforceable must be derived from the violated results').toMatch(
      /brokenResults\.filter\(.*method === 'deterministic'/
    );
    // Comments stripped: the file explains the "16 of 2" bug by naming the function that
    // caused it, and forbidding that would forbid documenting it.
    expect(
      code(join('src', 'components', 'NextStep.tsx')),
      'must not count proposals, which are not per-rule'
    ).not.toContain('proposeDenyRules');
  });

  it('does NOT pitch the guard when the guard would not have helped', () => {
    // Violations that were decided by reading the output cannot be blocked before the
    // fact. Selling the guard against them is a lie with a price on it, and this branch
    // exists specifically to refuse that sale.
    expect(next).toMatch(/not the kind a guard can block/i);
  });

  it('routes to a free tool when that is the honest answer', () => {
    // Low coverage is a ruleset problem. Recommending a subscription to someone whose
    // rules are unenforceable earns a refund and costs the trust the verdicts run on.
    const lowCoverage = next.slice(next.indexOf('left no trace'));
    expect(lowCoverage).toMatch(/href: '\/learn'|'\/learn'/);
  });

  it('has exactly one primary button per state', () => {
    // Two buttons of equal weight is the same failure as three banners, just tidier.
    const buttons = next.match(/rounded-xl bg-ink/g) ?? [];
    expect(buttons.length, 'more than one solid button in NextStep').toBe(1);
  });
});

describe('the free tier is never made worse to sell the paid one', () => {
  it('no page gates, meters or counts down a free audit', () => {
    const offenders: string[] = [];
    for (const f of pages) {
      const text = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/[^\n]*$/gm, '');
      if (/audits? remaining|audits? left|free audits? used|out of \d+ audits/i.test(text)) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(offenders, `a free-audit quota appears in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the post-result step never blocks reading the verdicts', () => {
    const next = read(join('src', 'components', 'NextStep.tsx'));
    // No modal, no overlay, no blur. The receipt is the product and it is free.
    expect(next).not.toMatch(/fixed inset-0|backdrop-blur-|blur-sm|pointer-events-none/);
    expect(next).not.toMatch(/sign ?in to (see|view|read)/i);
  });

  it('tells a signed-out visitor that auditing is free regardless', () => {
    const next = read(join('src', 'components', 'NextStep.tsx'));
    expect(next).toMatch(/free and unlimited whether or not you sign in/i);
  });
});

describe('one primary action per screen', () => {
  // The brief this was built to: "don't make features or buttons competing with each
  // other". A screenful with three equally-weighted calls to action has none.
  const LIMITS: [string, number][] = [
    ['src/app/page.tsx', 4], // hero, the turn's pivot has none, close, plus the funnel card links
    ['src/app/faq/page.tsx', 1],
    ['src/app/how-it-works/page.tsx', 2],
  ];

  for (const [file, max] of LIMITS) {
    it(`${file} has at most ${max} solid button${max === 1 ? '' : 's'}`, () => {
      const text = read(file);
      const solid = text.match(/className="[^"]*\bbg-ink\b[^"]*"/g) ?? [];
      // `bg-ink` on a non-button surface (a panel, a mark) is not a call to action.
      const buttons = solid.filter((c) => /px-\d|py-\d/.test(c) && /rounded/.test(c));
      expect(buttons.length, `${buttons.length} solid buttons: ${buttons.join(' | ').slice(0, 200)}`).toBeLessThanOrEqual(max);
    });
  }
});
