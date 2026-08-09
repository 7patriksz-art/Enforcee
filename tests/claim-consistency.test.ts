import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

/**
 * "character-for-character" was our description of the evidence gate, and it was an
 * overclaim: the gate stops a model *inventing* a sentence, not *citing a poorly-chosen
 * one*, and the locator tolerates ordinary whitespace differences by design.
 *
 * It was corrected in the site copy and the repo README, and then shipped to npm anyway —
 * because pack-cli.mjs generates a second README from a template string that nobody
 * thought to grep. Same failure as the licence key living in two files: one copy fixed,
 * one copy forgotten, and the stale one is the one the public sees.
 *
 * This is the third duplicated-source bug in a day, so the rule is now enforced rather
 * than remembered.
 */
const BANNED = [
  { phrase: 'character-for-character', why: 'overclaims the evidence gate; the locator tolerates whitespace and the gate does not judge relevance' },
  { phrase: 'character for character', why: 'same claim, unhyphenated' },
];

/**
 * Surfaces that make a promise TO A READER. Deliberately excludes src/lib/checks/judge.ts:
 * that file says CHARACTER-FOR-CHARACTER inside the prompt we send the judge, where it is
 * exactly right — we want the model to copy precisely. The overclaim was never asking the
 * model for an exact copy; it was telling users that is what we verify, when the locator
 * tolerates whitespace and never judges relevance. Instruction to a model and guarantee to
 * a person are different things, and only one of them was wrong.
 */
const SURFACES = [
  'README.md',
  'scripts/pack-cli.mjs',
  'src/app/page.tsx',
  'src/app/how-it-works/page.tsx',
  'src/app/pricing/page.tsx',
];

describe('public claims', () => {
  for (const file of SURFACES) {
    it(`${file} does not overclaim the evidence gate`, () => {
      const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const { phrase, why } of BANNED) {
        // Allow it inside a comment that is explaining the correction itself.
        const offending = text
          .split('\n')
          .filter((l) => l.toLowerCase().includes(phrase))
          .filter((l) => !/^\s*(\*|\/\/|#)/.test(l));
        expect(offending, `${file} still says "${phrase}" — ${why}`).toEqual([]);
      }
    });
  }
});
