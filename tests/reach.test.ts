import { describe, expect, it } from 'vitest';
import { parseRuleset } from '@/lib/rules/parse';
import { runDeterministic } from '@/lib/checks/deterministic';
import { unseenSurface, regionScope, hasCode } from '@/lib/rules/parse';

/**
 * A CHECK MAY NOT GRADE A RULE WHOSE SUBJECT IT CANNOT SEE.
 *
 * Engine plan CHANGE 1, called "the biggest idea" in it, and found for real on 2026-08-17 by
 * installing the packed tarball into a clean project and auditing three rules against one
 * paragraph of prose:
 *
 *     VIOLATED  Never use emojis in commit messages.   "🎉"
 *     VIOLATED  Never use emojis in code comments.     "🎉"
 *     VIOLATED  Never use emojis.                      "🎉"
 *
 * Only the third was true. The other two were FALSE ACCUSATIONS badged "proven by code", in
 * the free audit that is the entire shop window, against a product whose one promise is that
 * it does not do this. Nothing in the suite caught it because every test fed the checker an
 * output that WAS the rule's subject.
 *
 * TWO SCOPES, and they need different evidence:
 *
 *  · ANOTHER ARTEFACT — commit messages, branch names, PR descriptions. Never visible in an
 *    output file, so the rule is unverifiable regardless of what the output contains.
 *  · A REGION INSIDE THE OUTPUT — code comments, docstrings. Might be right there, so the
 *    OUTPUT decides: no code, no evidence; code present, check it properly.
 *
 * BOTH DIRECTIONS MATTER. Turning VIOLATED into UNVERIFIABLE is the loud half. Turning
 * FOLLOWED into UNVERIFIABLE is the quiet half and just as important: "no emoji in this
 * answer" is not a clean bill of health for anyone's commit messages, and a pass nobody
 * earned is the same lie told softly.
 */

function verdictFor(ruleText: string, output: string) {
  const { rules } = parseRuleset(`# Rules\n- ${ruleText}\n`);
  expect(rules.length, `"${ruleText}" did not parse into a rule at all`).toBe(1);
  const r = runDeterministic(rules[0], output);
  expect(r, `"${ruleText}" produced no deterministic result`).not.toBeNull();
  return r!;
}

const EMOJI_PROSE = 'Here is my answer. 🎉 No code anywhere in this text.';
const EMOJI_IN_CODE = 'Here:\n\n```ts\n// celebrate 🎉 the release\nexport const x = 1;\n```\n';
const CLEAN_PROSE = 'Here is my answer. It is entirely plain.';

describe('rules about another artefact are never graded from the output', () => {
  it('does not report VIOLATED for a rule about commit messages', () => {
    const r = verdictFor('Never use emojis in commit messages.', EMOJI_PROSE);
    expect(r.verdict, 'an emoji in prose was reported as a commit-message violation').toBe('UNVERIFIABLE');
    expect(r.evidence, 'evidence was cited for a surface that was never seen').toEqual([]);
    expect(r.rationale).toMatch(/commit messages/);
  });

  it('does not report FOLLOWED either — the quiet half of the same error', () => {
    const r = verdictFor('Never use emojis in commit messages.', CLEAN_PROSE);
    expect(r.verdict, 'a clean answer was treated as proof about commit messages').toBe('UNVERIFIABLE');
    expect(r.engaged, 'an unseen surface cannot count towards coverage').toBe(false);
  });

  it('covers the surfaces a real ruleset names', () => {
    for (const text of [
      'Never use emojis in commit messages.',
      'Never put a ticket id in the branch name.',
      'Always write a pull request description.',
      'Never use emojis in the email subject line.',
      'Always provide alt text.',
    ]) {
      expect(unseenSurface(text), `no surface detected in: ${text}`).not.toBeNull();
    }
  });

  it('and does NOT fire on rules that are about the output itself', () => {
    // The failure mode of over-correcting: a gate that silences real violations is worse than
    // the false accusation it was written to stop, because it fails silently and in our favour.
    for (const text of [
      'Never use emojis.',
      'Always end with a Summary section.',
      'Always cite sources with links.',
      'Never exceed 200 words.',
      'Always include a title for each section.',
    ]) {
      expect(unseenSurface(text), `over-matched an output rule: ${text}`).toBeNull();
    }
  });
});

describe('rules about a region inside the output are decided by the output', () => {
  it('is unverifiable when the output contains no code at all', () => {
    const r = verdictFor('Never use emojis in code comments.', EMOJI_PROSE);
    expect(r.verdict, 'an emoji in prose was reported as a code-comment violation').toBe('UNVERIFIABLE');
    expect(r.rationale).toMatch(/no code/);
  });

  it('STILL CATCHES the real violation when code is present', () => {
    // The control that stops this being a silencer. Without it the two tests above are
    // satisfied by a gate that simply never reports anything.
    const r = verdictFor('Never use emojis in code comments.', EMOJI_IN_CODE);
    expect(r.verdict, 'a real emoji inside a code comment was let through').toBe('VIOLATED');
    expect(r.evidence.length, 'violated with no evidence cited').toBeGreaterThan(0);
  });

  it('recognises code by fence and by indent, and prose as prose', () => {
    expect(hasCode('```ts\nconst x = 1;\n```')).toBe(true);
    expect(hasCode('~~~\nconst x = 1;\n~~~')).toBe(true);
    expect(hasCode('    const x = 1;')).toBe(true);
    expect(hasCode('Just a sentence about code.')).toBe(false);
    expect(regionScope('Never use emojis in code comments.')).toBe('code comments');
    expect(regionScope('Never use emojis.')).toBeNull();
  });
});

describe('the unscoped rule is unaffected, which is the whole point', () => {
  it('still reports VIOLATED with evidence', () => {
    const r = verdictFor('Never use emojis.', EMOJI_PROSE);
    expect(r.verdict).toBe('VIOLATED');
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('still reports FOLLOWED on a clean answer', () => {
    expect(verdictFor('Never use emojis.', CLEAN_PROSE).verdict).toBe('FOLLOWED');
  });
});
