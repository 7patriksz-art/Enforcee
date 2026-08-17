import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A TEST THAT LOOPS OVER A COLLECTION PROVES NOTHING IF THE COLLECTION CAN BE EMPTY.
 *
 * This is the sweep two security audits named and neither performed.
 * `52-SECURITY-AUDIT-2026-08-15`, method notes: *"That is grepable and it is the
 * highest-value sweep left."* `53-SECURITY-AUDIT-2026-08-17`, verbatim: *"the 15 August audit
 * named it and nobody has done it."* Two audits in a row identified it as the top remaining
 * item and both declined to do it, which is its own kind of finding.
 *
 * The audits called the family "the mirror pattern" — a control whose inputs are derived from
 * the code under test, so it can only ever confirm what already exists. Three shapes were
 * recorded: a test mirroring the claim query, a test mirroring the licence arithmetic, and a
 * redaction test list mirroring the redaction implementation. The last was described as the
 * newest shape: *"not a re-implementation but an enumeration that can only ever confirm what
 * exists."*
 *
 * THIS FILE ATTACKS THE ENUMERATION SHAPE, mechanically, because that is the half a grep can
 * actually reach:
 *
 *     import { PLANS } from '@/lib/plans';
 *     for (const p of PLANS) expect(p.wasPrice.monthly).toBeGreaterThan(p.price.monthly);
 *
 * Every assertion in that loop is real and can fail — but if `PLANS` is ever empty, the body
 * never runs and the test is green. On this project that is not hypothetical: SIX recorded
 * instances of a scan silently covering nothing, including two where a parser matched zero
 * rules and every assertion passed over the empty result.
 *
 * WHAT THIS CANNOT DO, stated rather than implied. It catches enumeration-without-a-floor. It
 * does NOT catch a test that re-implements the logic it is checking — the licence-arithmetic
 * shape — because deciding whether two pieces of code are "the same idea" is not something a
 * regex can do. That half is still open and is still the highest-value thing left.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Strip comments before analysing. The first run of this sweep FLAGGED ITSELF, because the
 * doc comment above quotes the offending pattern in order to explain it — a checker accusing
 * a file for describing the thing it checks. Same shape as the shim rule in
 * tests/portability.test.ts, which needs an exemption for exactly this reason; stripping
 * comments is the better fix because it needs no list.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

/** Every `NAME` imported from a local module — ALL-CAPS, i.e. a constant or a table. */
function importedConstants(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[@./][^']*'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim() ?? '';
      if (/^[A-Z][A-Z_0-9]{2,}$/.test(name)) out.add(name);
    }
  }
  return out;
}

/**
 * A floor is anything that fails when the collection is empty. Deliberately generous:
 * `.length` compared to a number, a `toHaveLength`, or an exact `toEqual([...])` against a
 * literal list — the last is the strongest floor of all, since it pins the contents.
 *
 * Generous on purpose. A rule that demanded one exact idiom would fire on correct code and be
 * switched off within a week — the lint-teaching-the-wrong-lesson shape already recorded in
 * tests/portability.test.ts.
 */
function hasFloor(src: string, name: string): boolean {
  // Any `expect(...)` whose SUBJECT mentions the collection and whose matcher pins a size or
  // an exact list. Written against the subject rather than an exact idiom because the second
  // false positive this sweep produced was a real, strong floor it could not see:
  //
  //     expect((SHAPE_EXEMPT_FILES as string[]).slice().sort()).toEqual([...five entries])
  //
  // — a closed-set assertion, which is a STRONGER floor than a length check, rejected because
  // of nested parentheses. A control that cannot recognise a better version of the thing it
  // demands is a control that teaches people to write the worse version.
  const subject = new RegExp(
    `expect\\((?:[^;]*?)\\b${name}\\b(?:[^;]*?)\\)\\s*(?:,[^;]*?)?\\)?\\s*\\.(?:toHaveLength|toEqual\\(\\s*\\[|toBeGreaterThan|toBe\\()`,
    's'
  );
  const lengthAnywhere = new RegExp(`\\b${name}\\.length\\b[\\s\\S]{0,120}?toBeGreaterThan|toBeGreaterThan[\\s\\S]{0,120}?\\b${name}\\.length\\b`);
  return subject.test(src) || lengthAnywhere.test(src);
}

const LOOP = (name: string) =>
  new RegExp(`\\bfor\\s*\\(\\s*const\\s+[\\w{}\\[\\], ]+\\s+of\\s+${name}\\b|\\b${name}\\.(map|forEach|flatMap|filter|some|every)\\(`);

const testFiles = readdirSync(join(ROOT, 'tests'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

describe('a loop over an imported collection cannot silently cover nothing', () => {
  it('found the test files, so an empty sweep cannot pass', () => {
    // Rule 9, applied to this file itself: the checker needs a control before the thing it
    // checks does. Without this, a broken readdir would report the whole suite clean forever —
    // which is precisely the defect being swept for, committed by the sweep.
    expect(testFiles.length, 'no test files found — this sweep checks nothing').toBeGreaterThan(40);
    expect(testFiles, 'the known instance is not in the sweep').toContain('plans.test.ts');
  });

  it('every test that enumerates an imported constant asserts it is not empty', () => {
    const offenders: string[] = [];
    let enumerations = 0;

    for (const f of testFiles) {
      const src = code(readFileSync(join(ROOT, 'tests', f), 'utf8'));
      for (const name of importedConstants(src)) {
        if (!LOOP(name).test(src)) continue;
        enumerations++;
        if (!hasFloor(src, name)) offenders.push(`tests/${f}: loops ${name} with no non-empty assertion`);
      }
    }

    // A rule that matched nothing is not a rule.
    expect(
      enumerations,
      'no test enumerates an imported constant anywhere — the pattern changed and this rule now checks nothing'
    ).toBeGreaterThan(0);

    expect(
      offenders,
      'empty that collection and every assertion in the loop passes over nothing. Add a floor — ' +
        'expect(X.length).toBeGreaterThan(n) — so the test fails when there is nothing to test. ' +
        'Six recorded instances of a scan silently covering nothing on this project.'
    ).toEqual([]);
  });
});
