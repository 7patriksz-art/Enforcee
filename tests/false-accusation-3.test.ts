import { describe, it, expect } from 'vitest';
import { runAudit } from '../src/lib/audit';

/**
 * False accusation #11: "cite the file and line" answered in plain English.
 *
 * Found on 2026-08-14 while dogfooding the new conversion pipeline — driving a real audit
 * through a browser to check that the post-result step said something sensible. It did.
 * The verdict behind it did not:
 *
 *   rule:    Always cite the file and line for every claim.
 *   output:  The fix is in src/app.ts line 12 and src/db.ts line 40.
 *   verdict: VIOLATED — "No citations found in the output — no link, file:line
 *            reference, section number or footnote marker."
 *
 * The output contains two file-and-line citations. The checker only recognised the colon
 * form, `src/app.ts:12`, and "src/app.ts line 12" is how a person actually writes it in a
 * sentence.
 *
 * The comment directly above that pattern already said this class had been fixed once —
 * for `file:42` and "Section 4.2". It was fixed for the phrasings someone thought of, and
 * the next phrasing a real output used walked straight through it. That is the shape worth
 * remembering: a false-accusation fix is only as wide as the examples it was written
 * against, so the examples belong in a test where they can be added to.
 *
 * DIRECTION MATTERS. Every case below is paired: the citation forms must be FOLLOWED, and
 * the near-misses must still be VIOLATED. Widening a pattern until nothing is ever accused
 * trades a false VIOLATED for a false FOLLOWED — and of the two, the wrong accusation is
 * at least visible to the person it is made against, while a wrong pass is invisible to
 * everyone forever.
 */

const RULE = '- Always cite the file and line for every claim.\n';

async function verdict(output: string) {
  const { receipt } = await runAudit({
    ruleset: RULE,
    output,
    artifact: 'CLAUDE.md',
    deterministicOnly: true,
  });
  return receipt.results[0]?.verdict;
}

describe('citation_required recognises how people actually cite', () => {
  const CITED = [
    // The one that was actually accused, verbatim from the browser run.
    'The fix is in src/app.ts line 12 and src/db.ts line 40.',
    // Comma form.
    'See src/lib/http.ts, line 42 for the retry logic.',
    // "at line" / "on line".
    'The bug is in cli/index.ts at line 417.',
    'It fails in guard/guard.mjs on line 88.',
    // Reversed order.
    'Look at line 12 of src/app.ts.',
    'Lines 40-58 in src/lib/audit.ts do the sampling.',
    // Backticked, which is how it appears in most real answers.
    'Fixed in `src/lib/checks/deterministic.ts` line 535.',
    // GitHub permalink fragment.
    'Permalink: src/app.ts#L42',
    // The colon form that already worked — a regression guard, since the pattern moved.
    'The fix is in src/lib/http.ts:42.',
    // And the non-file citations that also already worked.
    'As set out in Section 4.2 of the handbook.',
    'See https://example.com/docs for the full list.',
  ];

  for (const output of CITED) {
    it(`accepts: ${output.slice(0, 52)}`, async () => {
      expect(await verdict(output), `falsely accused: ${output}`).toBe('FOLLOWED');
    });
  }

  const NOT_CITED = [
    // A bare line number is not a citation. Prose says this constantly.
    'I rewrote line 12 so it no longer throws.',
    'There were 42 errors and 3 warnings.',
    // A filename with no location is not a file-and-line citation.
    'I changed src/app.ts.',
    // Nothing at all.
    'Done — everything works now.',
  ];

  for (const output of NOT_CITED) {
    it(`still flags: ${output.slice(0, 52)}`, async () => {
      expect(await verdict(output), `wrongly passed: ${output}`).toBe('VIOLATED');
    });
  }
});
