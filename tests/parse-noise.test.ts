import { describe, it, expect } from 'vitest';
import { splitRules } from '../src/lib/rules/parse';

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
