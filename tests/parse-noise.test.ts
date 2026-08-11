import { describe, it, expect } from 'vitest';
import { splitRules, classify } from '../src/lib/rules/parse';

/**
 * Bullets used to be accepted unconditionally. That is correct for a hand-written CLAUDE.md,
 * where every bullet IS a rule, and badly wrong for a real document, where bullets are also
 * table-of-contents entries, section labels and definition lists.
 *
 * Benchmarking against the HANDBOOK corpus of real enterprise SOPs pulled in
 * "Purpose and Scope" and "Overview ........." as rules. Both halves of this file matter:
 * the rejections stop the noise, and the acceptances stop the fix from eating real rules —
 * which would be the far worse failure and would not be visible in any headline number.
 */
describe('rule extraction rejects structural furniture', () => {
  const parse = (md: string) => splitRules(md).map((r) => r.text);

  it('drops table-of-contents lines', () => {
    expect(parse('- Overview ..................................... 4')).toEqual([]);
    expect(parse('- Vendor Onboarding ......... 12')).toEqual([]);
  });

  it('drops numbered headings lifted into a list', () => {
    expect(parse('- 3.2 Vendor Onboarding')).toEqual([]);
    expect(parse('- 4 — Scope')).toEqual([]);
  });

  it('drops labels that merely introduce a list', () => {
    expect(parse('- Required documents:')).toEqual([]);
  });

  it('drops bare cross-references', () => {
    expect(parse('- Appendix B')).toEqual([]);
    expect(parse('- Section 7')).toEqual([]);
  });

  it('drops title-case heading residue, including with an ampersand', () => {
    expect(parse('- Purpose and Scope')).toEqual([]);
    expect(parse('- Overview & Purpose')).toEqual([]);
  });
});

describe('rule extraction keeps real rules', () => {
  const parse = (md: string) => splitRules(md).map((r) => r.text);

  it('keeps short rules with no modal verb — the hand-written case', () => {
    // If the noise filter ever eats these, the product is broken for its primary use.
    expect(parse('- No emojis.')).toEqual(['No emojis.']);
    expect(parse('- Tabs, not spaces.')).toEqual(['Tabs, not spaces.']);
    expect(parse('- British English throughout.')).toHaveLength(1);
  });

  it('keeps ordinary obligations', () => {
    expect(parse('- Never force-push to a shared branch.')).toHaveLength(1);
    expect(parse('- Always cite sources with a markdown link.')).toHaveLength(1);
    expect(parse('- Escalate to compliance within 24 hours.')).toHaveLength(1);
  });

  it('keeps a numbered rule, which looks like a numbered heading but is not', () => {
    expect(parse('1. Never commit secrets to the repository.')).toHaveLength(1);
  });
});

/**
 * The false accusation this prevents, found by walking a first run as a stranger on a
 * ruleset any real user would write.
 *
 * "Always run `npm test` before committing" was classified required_literal: the backticked
 * command was extracted, then required to appear in the model's OUTPUT, and reported VIOLATED
 * because an answer about refactoring auth does not contain the string "npm test".
 *
 * That is a false accusation, and "zero false accusations" is on the landing page. These
 * rules are not judged-instead-of-deterministic — no reading of a text output settles whether
 * a command ran, by us or by anyone.
 */
describe('action rules are not mistaken for text rules', () => {
  const kindOf = (text: string) => classify(text).kind;

  it('does not read "always run `npm test`" as a required literal', () => {
    expect(kindOf('Always run `npm test` before committing.')).toBe('action');
  });

  it('covers the other action shapes a real ruleset contains', () => {
    for (const r of [
      'Always deploy through the pipeline, never `vercel --prod` by hand.',
      'Escalate to the compliance officer within 24 hours.',
      'Never force-push to a shared branch.',
      'Obtain a second approval before merging.',
    ]) {
      expect(kindOf(r), `not detected: ${r}`).toBe('action');
    }
  });

  it('does NOT steal rules that really are about the text', () => {
    // The costly direction. A rule about output shape must keep its deterministic checker.
    expect(kindOf('Always include `## Summary` as the first heading.')).not.toBe('action');
    expect(kindOf('Never mention `internal-only` in a reply.')).not.toBe('action');
    expect(kindOf('Always respond in English.')).not.toBe('action');
    expect(kindOf('Never use emojis.')).not.toBe('action');
    expect(kindOf('Keep responses under 200 words.')).not.toBe('action');
  });
});
