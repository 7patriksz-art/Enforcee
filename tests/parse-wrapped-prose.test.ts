import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRuleset, splitRules } from '../src/lib/rules/parse';

/**
 * Markdown hard-wraps. A paragraph is a run of lines, not a line.
 *
 * Found 2026-08-15 by dogfooding: `enforcee audit CLAUDE.md SETUP-EMAIL-AND-BILLING.md`
 * reported two deterministic VIOLATED verdicts against a document that breaks nothing. The
 * two "rules" it accused the document of breaking were halves of ONE descriptive sentence in
 * our own preamble, cut at the 95-column wrap:
 *
 *     `enforcee audit CLAUDE.md <output>` grades an
 *     answer against this file; `enforcee guard CLAUDE.md` compiles the enforceable ones into a
 *
 * The splitter fed each physical line to the sentence splitter on its own, so a sentence
 * that crosses a line break was never one sentence. Measured over the five markdown files
 * this repo ships, 53 of 98 prose-derived rules were mid-sentence fragments.
 *
 * Three consequences, all of them shipping:
 *
 *  1. FALSE ACCUSATION. A fragment is classified on the half of the sentence it happens to
 *     contain, so a backticked command in a descriptive clause became `required_literal`
 *     and every output that did not quote it verbatim was VIOLATED, badged deterministic.
 *  2. Rule ids did not survive re-wrapping. Ids are content-addressed so that a rule stays
 *     the same rule when it is reworded (charter, layer 3 MONITOR). Reflowing a paragraph
 *     is not even a rewording, and it changed every id in it.
 *  3. A real obligation written in prose across two lines was split into two half-rules and
 *     each half checked separately.
 *
 * The fix is structural, not another vocabulary entry: join a wrapped paragraph before
 * splitting it into sentences. Table rows stay one unit per row — a table row is a record,
 * not a wrapped line, and joining them would glue unrelated rows into one "sentence".
 */

const REPO = resolve(__dirname, '..');

/** The exact paragraph from CLAUDE.md that produced the false accusation. */
const CLAUDE_PREAMBLE = [
  '# Enforcee — rules for anyone, human or model, working in this repo',
  '',
  'These are not aspirations. Every one of them was written after something went wrong, and',
  'most of them have a test enforcing them. `enforcee audit CLAUDE.md <output>` grades an',
  'answer against this file; `enforcee guard CLAUDE.md` compiles the enforceable ones into a',
  'hook that blocks before the fact.',
  '',
].join('\n');

/** A rule text that stops mid-sentence is a parse failure, whatever it is later graded as. */
function fragments(rules: { text: string }[]): string[] {
  return rules
    .map((r) => r.text.trim())
    .filter((t) => !/[.!?:)|]$/.test(t) && !/\*\*$/.test(t) && !/`$/.test(t));
}

describe('a wrapped paragraph is one paragraph', () => {
  it('does not cut our own preamble into two rules at the wrap', () => {
    const rules = splitRules(CLAUDE_PREAMBLE, 'CLAUDE.md');
    expect(fragments(rules)).toEqual([]);
    // The half-sentences that were accused of being broken rules must not exist at all.
    expect(rules.map((r) => r.text)).not.toContain('`enforcee audit CLAUDE.md <output>` grades an');
  });

  it('keeps an obligation that crosses a line break in one piece', () => {
    const wrapped = ['Every response must include a', 'summary section at the end.'].join('\n');
    const rules = splitRules(wrapped);
    expect(rules).toHaveLength(1);
    expect(rules[0].text).toBe('Every response must include a summary section at the end.');
    expect(rules[0].startLine).toBe(1);
    expect(rules[0].endLine).toBe(2);
  });

  it('gives a paragraph the same rule ids however it is wrapped', () => {
    const sentence =
      'Every response must include a summary section at the end, and it must never contain an emoji.';
    const narrow = sentence.replace(/(.{1,40})\s/g, '$1\n');
    const wide = sentence.replace(/(.{1,80})\s/g, '$1\n');
    const ids = (t: string) => parseRuleset(t).rules.map((r) => r.id);

    expect(ids(narrow).length).toBeGreaterThan(0);
    expect(ids(narrow)).toEqual(ids(sentence));
    expect(ids(wide)).toEqual(ids(sentence));
  });

  it('joins the continuation lines of a blockquote, and only within the quote', () => {
    const doc = [
      '> Never continue while it says Pending. An unverified domain fails at send time, and',
      '> the failure looks like the user never got the email.',
      '',
      'Always keep the ledger append-only.',
    ].join('\n');
    const rules = splitRules(doc);
    expect(fragments(rules)).toEqual([]);
    expect(rules.some((r) => r.text.includes('fails at send time, and the failure looks like'))).toBe(true);
    // The quote must not swallow the paragraph after the blank line.
    expect(rules.some((r) => r.text === 'Always keep the ledger append-only.')).toBe(true);
  });

  // The joiner is new line-handling code, and line handling is where this project's
  // Windows bugs live — five separator bugs so far, each found only by the Windows leg of
  // CI at a full red build. A CRLF file must produce the same rules, with the same ids and
  // the same line numbers, as the LF one.
  it('parses a CRLF document identically to the LF one', () => {
    const lf = [
      'Every response must include a',
      'summary section at the end.',
      '',
      '> Never skip a control while it says Pending. An unverified domain fails at',
      '> send time.',
      '',
    ].join('\n');
    const rules = splitRules(lf);
    expect(rules.length).toBeGreaterThan(0);
    expect(splitRules(lf.replace(/\n/g, '\r\n'))).toEqual(rules);
    expect(parseRuleset(lf.replace(/\n/g, '\r\n')).rules.map((r) => r.id)).toEqual(
      parseRuleset(lf).rules.map((r) => r.id)
    );
  });

  it('never glues two table rows into one rule', () => {
    const table = [
      '| ID | Invariant | Status |',
      '|---|---|---|',
      '| D-021 | Never offer a free trial. | ENFORCED |',
      '| D-022 | Always expire a licence at 45 days. | ENFORCED |',
    ].join('\n');
    const rules = splitRules(table);
    expect(rules.some((r) => r.text.includes('D-021') && r.text.includes('D-022'))).toBe(false);
    for (const r of rules) expect(r.startLine).toBe(r.endLine);
  });
});

describe('the repo audits its own documents without inventing rules', () => {
  // E-3: a scan that silently covers nothing passes. These assert the corpus is real.
  const docs = ['CLAUDE.md', 'README.md', 'INVARIANTS.md'];

  it('scans a corpus that is actually there', () => {
    let total = 0;
    for (const d of docs) {
      const rules = splitRules(readFileSync(resolve(REPO, d), 'utf8'), d);
      expect(rules.length).toBeGreaterThan(3);
      total += rules.length;
    }
    expect(total).toBeGreaterThan(60);
  });

  it('produces no mid-sentence rule from any document this repo ships', () => {
    const found: string[] = [];
    for (const d of docs) {
      for (const t of fragments(splitRules(readFileSync(resolve(REPO, d), 'utf8'), d))) {
        found.push(`${d}: ${t}`);
      }
    }
    expect(found).toEqual([]);
  });
});
