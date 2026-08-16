import { describe, expect, it } from 'vitest';
import { parseRuleset } from '@/lib/rules/parse';

/**
 * "Always end with a summary section" is a checkable rule and was coming back UNVERIFIABLE.
 *
 * Found 2026-08-16 by installing our own freshly published 0.9.0 from npm the way a stranger
 * would, writing a two-rule CLAUDE.md, and auditing an answer that plainly satisfied it:
 *
 *     FOLLOWED       proof  Never use emoji.
 *     UNVERIFIABLE      —   Always end with a summary section.
 *
 * The answer contained a literal `## Summary`. The classifier only recognised the formal
 * phrasing — `section|heading … titled|called|named X` — and almost nobody writes that.
 *
 * This is the worst shape a miss can take: the rule is trivially checkable, the output
 * obviously complies, and the product says "we could not tell". It reads as the engine being
 * weak rather than the parser being narrow, and it moves a free deterministic verdict onto
 * the judged layer — lowering the share decided by code, which is the number the entire
 * public claim rests on.
 */
const kindOf = (rule: string) => {
  const r = parseRuleset(`- ${rule}`).rules[0];
  return { kind: r?.check?.kind ?? 'judged', heading: (r?.check as { heading?: string } | undefined)?.heading };
};

describe('the phrasings people actually use compile to a heading check', () => {
  for (const [rule, expected] of [
    ['Always end with a summary section.', 'summary'],
    ['Every answer must include a Summary heading.', 'Summary'],
    ['Always finish with a Next Steps section.', 'Next Steps'],
    ['Include a Limitations section.', 'Limitations'],
    ['Always include a section titled Summary.', 'Summary'],
  ] as const) {
    it(`"${rule}"`, () => {
      const got = kindOf(rule);
      expect(got.kind, `still judged — a free verdict pushed onto the model`).toBe('heading_required');
      expect(got.heading?.toLowerCase()).toBe(expected.toLowerCase());
    });
  }
});

describe('it does not manufacture an unsatisfiable rule', () => {
  // The failure recorded in parse.ts directly above this pattern: a rule demanding a heading
  // literally titled "Next Steps at the end of every response", which no output can contain,
  // reported as a VIOLATION rather than as the parse failure it was. A name that names
  // nothing must stay judged.
  for (const rule of [
    'Always include a long section.',
    'Add a heading.',
    'Keep each section short.',
    'Never end with a summary section.',
  ]) {
    it(`"${rule}" stays judged`, () => {
      expect(kindOf(rule).kind, 'invented a heading requirement out of a vague phrase').not.toBe('heading_required');
    });
  }
});
