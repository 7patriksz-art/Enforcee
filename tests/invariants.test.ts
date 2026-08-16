import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { ENTITLING_STATUSES } from '../src/lib/entitlements';
import { PLANS } from '../src/lib/plans';

/**
 * The anti-contradiction control.
 *
 * A daily agent now works on this repo. Over weeks the risk is not a bad line of code — the
 * test suite catches those. It is the slow, plausible reversal of a decision nobody
 * remembers making: a trial reinstated because it lifts conversion, a hardcoded domain
 * re-added because it is simpler, a threshold lowered because a test was failing, a
 * limitation removed from a page because it read badly.
 *
 * Every one of those is individually defensible and collectively fatal to a product whose
 * entire pitch is that it notices when rules stop being followed.
 *
 * A prompt saying "do not contradict earlier decisions" would not work. That is precisely
 * the instruction this product exists because models ignore. So the decisions are tests.
 *
 * INVARIANTS.md is the index; this file is the control. When a row here fails, the answer is
 * almost never to change the assertion — it is that something reversed a decision. Changing
 * an invariant is legitimate, but it takes a human, a dated entry in the decisions log, and
 * this file updated in the same commit.
 */

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'npm-dist', 'theme-audit', 'dist', 'coverage'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const ALL = walk(ROOT);

/** Strip comments, so a note explaining a past bug is not read as committing it again. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

/**
 * The deliberate exception, marked in the source.
 *
 * Some of these checks must be violated ON PURPOSE — most obviously by the tests that prove
 * the bug, which have to contain the broken shape in order to assert it is wrong. A blanket
 * loosening would blunt the check everywhere; a per-line marker keeps it sharp and leaves a
 * grep-able list of every place we knowingly stepped outside a rule.
 *
 *     expect(f.includes('a/b')).toBe(false); // invariant-ok: proves the Windows failure
 */
const EXEMPT = /invariant-ok:/;
const lines = (text: string) => text.split('\n').filter((l) => !EXEMPT.test(l));
const src = ALL.filter((f) => /\.(ts|tsx|mjs)$/.test(f) && relative(ROOT, f).split(sep)[0] === 'src');

describe('the ledger itself', () => {
  it('exists, and every ENFORCED row claims a control', () => {
    const md = read('INVARIANTS.md');
    expect(md).toContain('# Invariants');
    // Coverage control: if the table is emptied or restructured, this file's assertions
    // stop corresponding to anything and it would still pass.
    const enforced = (md.match(/\| ENFORCED \|/g) ?? []).length;
    expect(enforced, 'INVARIANTS.md lists almost nothing as ENFORCED').toBeGreaterThan(15);
  });

  it('never deletes a row — superseded ones stay', () => {
    // Rows may be superseded, never removed. This asserts the mechanism is documented;
    // the honest enforcement is review, but stating it here makes the intent unambiguous.
    expect(read('INVARIANTS.md')).toContain('SUPERSEDED BY');
  });
});

describe('D-021 · no free trials', () => {
  it('no plan offers a trial', () => {
    const plans = read('src/lib/plans.ts');
    expect(/trial_period_days/i.test(plans), 'a Stripe trial period reappeared').toBe(false);
  });

  it('NO page or component offers one', () => {
    // Scoped to pricing/page.tsx until 2026-08-14, and it missed a live "Start the trial"
    // button in account/Licence.tsx that had been there five days. A decision enforced on
    // one file is enforced nowhere — the whole surface, or it is not a control.
    const offenders: string[] = [];
    for (const f of src.filter((f) => f.endsWith('.tsx'))) {
      const text = lines(code(readFileSync(f, 'utf8')));
      text.forEach((line, i) => {
        // "No trial" as a statement is desirable; offering one is the violation.
        if (/\b(start|begin|claim|get) (the |your |a )?(free )?trial\b|free trial today|try free for/i.test(line)) {
          offenders.push(`${relative(ROOT, f)}:${i + 1}`);
        }
      });
    }
    expect(offenders, `a trial is offered in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('trialing and past_due still entitle', () => {
    // The other half of D-021, and the one a cleanup pass would quietly drop as dead code.
    //
    // This used to grep every entitlements/subscription file — comments included — for the
    // words. The doc comment directly above ENTITLING_STATUSES explains why `past_due` is
    // there, so it satisfied the assertion by itself. On 2026-08-16 `past_due` was deleted
    // from the set, cutting a real subscriber off the hour their card failed, and all 862
    // tests stayed green. The control now reads the set the code actually branches on.
    expect(ENTITLING_STATUSES.has('active')).toBe(true);
    expect(ENTITLING_STATUSES.has('trialing'), 'a hand-made Stripe subscription reports trialing').toBe(true);
    expect(ENTITLING_STATUSES.has('past_due'), "D-021b: dunning must not cut a payer off the hour a card expires").toBe(true);
    // Coverage guard: a set that entitles everything would satisfy the three lines above.
    expect(ENTITLING_STATUSES.has('canceled')).toBe(false);
    expect(ENTITLING_STATUSES.has('incomplete_expired')).toBe(false);
  });
});

describe('auditing stays free and unmetered', () => {
  it('the free plan says unlimited audits', () => {
    // This used to be `/unlimited/i.test(<the whole of plans.ts>)`, which the Founder plan's
    // "Unlimited projects" satisfied on its own. On 2026-08-16 the free plan's own line was
    // changed to "500 audits a month" — metering the free tier, a reversal of the invariant
    // this row exists for — and all 862 tests stayed green. It now reads the free plan.
    const free = PLANS.find((p) => p.id === 'free');
    expect(free, 'there is no free plan any more').toBeTruthy();
    const unlocks = free!.unlocks.join(' | ');
    expect(unlocks, `free unlocks: ${unlocks}`).toMatch(/unlimited audits/i);
    // And no numeric cap on auditing anywhere in the free tier's own copy.
    const copy = [unlocks, free!.walls?.join(' | ') ?? '', free!.pitch].join(' | ');
    expect(/\b\d[\d,]*\s*audits?\b/i.test(copy), `free tier names an audit quota: ${copy}`).toBe(false);
  });

  it('no page offers to sell an audit quota', () => {
    const pages = ALL.filter((f) => f.endsWith('page.tsx')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(/audits? (per month|remaining|left)\b.*\$|\$\d+ ?\/ ?audit/i.test(pages)).toBe(false);
  });
});

describe('D-025 · the custom domain arrives only by env var', () => {
  it('enforcee.com is never a hardcoded fallback', () => {
    const siteUrl = read('src/lib/site-url.ts');
    expect(siteUrl).toContain('NEXT_PUBLIC_SITE_URL');
    // The literal appears in a comment explaining why it must not be a fallback, so
    // comments are stripped — but NOT with /\/\/[^\n]*/. That eats `//enforcee.com` out of
    // `'https://enforcee.com'`, because a URL contains a double slash. This assertion
    // passed against a deliberately reverted site-url.ts: its own preprocessing removed
    // the exact string it was looking for. A control that could not have failed.
    // `code()` only strips a `//` that begins a line, which is the difference.
    const body = code(siteUrl);
    expect(/['"`]https?:\/\/(www\.)?enforcee\.com/.test(body), 'a hardcoded domain fallback is back').toBe(false);
  });

  it('nothing else computes a site URL of its own', () => {
    // stripe.ts once carried a second copy with a DIFFERENT fallback, in the one module
    // where being wrong strands a customer who has just been charged.
    const offenders = src
      .filter((f) => !f.endsWith(join('lib', 'site-url.ts')))
      // Comments stripped: notify-templates.ts explains WHY it must not hardcode a
      // domain, and naming VERCEL_URL in that explanation is not a second copy of the
      // logic. Fourth time a control here has flagged its own documentation.
      .filter((f) => /VERCEL_URL/.test(code(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f));
    expect(offenders, `second copy of the site-URL logic in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('D-024 · checkout requires an account', () => {
  it('the route refuses a signed-out caller', () => {
    const route = read('src/app/api/checkout/route.ts');
    expect(route).toMatch(/401/);
    expect(route).toMatch(/signInUrl/);
  });
});

describe('D-007 · guard design rules that must not be relaxed', () => {
  const guard = read('guard/guard.mjs');

  it('never exits non-zero', () => {
    // A guard bug must not be able to wedge a session. `process.exit(1)` anywhere here is
    // the single most damaging regression possible in this file.
    const bad = guard.match(/process\.exit\(\s*[1-9]/g) ?? [];
    expect(bad, 'the guard can now exit non-zero and wedge a session').toEqual([]);
  });

  it('has a top-level catch, so an internal error still speaks JSON', () => {
    // `/catch/.test(guard)` was green against a guard whose top-level try/catch had been
    // deleted outright — the file holds seventeen other catches and two comments containing
    // the word. Watched on 2026-08-16: removed the wrapper, left valid JS, control passed.
    //
    // The property is structural: the LAST call to main() is inside a try whose catch writes
    // JSON and exits 0. That is what stops an internal error producing empty stdout, which
    // Claude Code reads as a non-blocking error — a silent fail-open with no ledger row.
    const tail = guard.slice(guard.lastIndexOf('main()'));
    expect(tail, 'main() is no longer wrapped in a top-level catch').toMatch(
      /\}\s*catch\s*\(/
    );
    expect(tail, 'the top-level catch no longer writes JSON to stdout').toMatch(/process\.stdout\.write/);
    expect(tail, 'the top-level catch no longer exits 0').toMatch(/process\.exit\(0\)/);
  });

  it('splits rm -rf by target rather than blocking it outright', () => {
    // A guard that blocks `rm -rf ./dist` gets uninstalled by Friday, and an uninstalled
    // guard blocks nothing at all.
    expect(/no-preserve-root|preserve-root|\/\s*\$|rootish|isRootTarget/i.test(guard)).toBe(true);
  });
});

describe('no curl | sh installer', () => {
  it('nowhere in the repo tells a user to pipe a download into a shell', () => {
    const offenders: string[] = [];
    for (const f of ALL.filter((f) => /\.(ts|tsx|mjs|md|json|ya?ml)$/.test(f))) {
      const rel = relative(ROOT, f);
      if (rel === 'INVARIANTS.md' || rel.startsWith(join('tests', ''))) continue;
      const text = lines(code(readFileSync(f, 'utf8'))).join('\n');
      // The pattern we block by default. Shipping one ourselves would be indefensible.
      if (/curl[^\n|]*\|\s*(sudo\s+)?(ba)?sh\b/.test(text)) offenders.push(rel);
    }
    expect(offenders, `curl | sh in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('E-2 · no literal slash in a path comparison', () => {
  it('no test compares paths with a hardcoded separator', () => {
    // Five separator bugs, every one caught only by the Windows leg of CI at a full red
    // build. This is the cheap version, and it runs on every platform.
    const offenders: string[] = [];
    for (const f of ALL.filter((f) => relative(ROOT, f).split(sep)[0] === 'tests')) {
      const rel = relative(ROOT, f);
      const text = lines(code(readFileSync(f, 'utf8'))).join('\n');
      // `.endsWith('a/b')` / `.includes('a/b')` — a path shape with a separator in it.
      if (/\.(endsWith|includes)\(\s*(['"`])[^'"`\n]*[A-Za-z0-9_-]\/[A-Za-z0-9_-][^'"`\n]*\2\s*\)/.test(text)) {
        // walk() results normalised to forward slashes are fine; those files say so.
        if (!/split\(sep\)\.join\('\/'\)/.test(readFileSync(f, 'utf8'))) offenders.push(rel);
      }
    }
    expect(offenders, `literal-slash path comparison in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('E-6 · install instructions work on all three platforms', () => {
  it('no shipped surface prints a bash-only or macOS-only install step', () => {
    const surfaces = ['src', 'cli', 'README.md', 'scripts'];
    const offenders: string[] = [];
    for (const f of ALL) {
      const rel = relative(ROOT, f);
      if (!surfaces.some((s) => rel === s || rel.startsWith(s + sep))) continue;
      if (!/\.(ts|tsx|mjs|md)$/.test(f)) continue;
      if (rel === join('src', 'lib', 'licence-local.ts')) continue; // documents the old bug
      // Comments stripped: several files explain the old broken instruction on purpose.
      const text = lines(code(readFileSync(f, 'utf8'))).join('\n');
      if (/pbpaste|pbcopy/.test(text)) offenders.push(`${rel} (macOS-only clipboard)`);
      if (/mkdir -p[^\n]*\.enforcee/.test(text)) offenders.push(`${rel} (bash-only mkdir)`);
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});

describe('H-1 · every verdict carries its method', () => {
  it('the verdict type still requires a method', () => {
    const types = read('src/lib/types.ts');
    expect(types).toMatch(/method/);
    expect(types).toMatch(/deterministic/);
    expect(types).toMatch(/judged/);
  });

  it('UNVERIFIABLE is still a reachable verdict', () => {
    // Comments stripped, and the union member asserted rather than the bare word: two doc
    // comments in this file mention UNVERIFIABLE by name, so `toContain('UNVERIFIABLE')`
    // stayed green on 2026-08-16 with the member deleted from the Verdict union entirely.
    // `tsc` did catch that one — but this row is supposed to, and did not.
    const types = code(read('src/lib/types.ts'));
    expect(types, 'UNVERIFIABLE is no longer a member of the Verdict union').toMatch(
      /['"`]UNVERIFIABLE['"`]/
    );
  });
});

describe('D-018 · unit cost never leaves /admin', () => {
  it('is covered by its own dedicated control', () => {
    // Named here so the ledger points somewhere real, rather than duplicating the check.
    expect(ALL.some((f) => f.endsWith('unit-cost-containment.test.ts'))).toBe(true);
  });
});
