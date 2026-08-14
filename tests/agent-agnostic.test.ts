import { describe, it, expect } from 'vitest';
import { parseRuleset } from '../src/lib/rules/parse';

/**
 * "Works with CLAUDE.md, AGENTS.md, .cursor/rules or a raw system prompt."
 *
 * That sentence is on the audit page, so it is a claim, so it needs a control. Nothing
 * tested it — and writing this found a real recall bug: the most ordinary form of an
 * instruction in English, a bare imperative in first position, was being dropped.
 *
 *     Run `pnpm build` before you claim it compiles.
 *
 * The parser's vocabulary list did not contain "run", so that line was not a rule. Nor was
 * anything beginning Check, Verify, Add, Delete, Commit, Escape or Validate. CLAUDE.md
 * files tend to be written as `- Never do X` bullets and hid the gap; AGENTS.md files are
 * written as prose under headings and do not.
 */

describe('rulesets are agent-agnostic', () => {
  it('strips MDC frontmatter from a Cursor rule file rather than reading it as rules', () => {
    const { rules } = parseRuleset(
      `---
description: TypeScript conventions
globs: ["**/*.ts"]
alwaysApply: true
---

- Never use \`any\`.
- Always run the formatter before committing.
`,
      '.cursor/rules/ts.mdc'
    );
    expect(rules.map((r) => r.text)).toEqual([
      'Never use `any`.',
      'Always run the formatter before committing.',
    ]);
  });

  it('reads prose directives out of an AGENTS.md, not just bullets', () => {
    const { rules } = parseRuleset(
      `# AGENTS.md

## Build
Run \`pnpm build\` before you claim it compiles.

- Do not edit files under vendor/.
`,
      'AGENTS.md'
    );
    const texts = rules.map((r) => r.text);
    expect(texts).toContain('Run `pnpm build` before you claim it compiles.');
    expect(texts).toContain('Do not edit files under vendor/.');
  });

  it('catches the bare imperatives the vocabulary list missed', () => {
    for (const line of [
      'Run the migration against a copy first.',
      'Check the digest before trusting the receipt.',
      'Verify the signature on every licence.',
      'Escape user input before it reaches the shell.',
      'Delete the temporary directory when you are done.',
      'Commit after every wave of work.',
    ]) {
      const { rules } = parseRuleset(`# Handbook\n\n${line}\n`, 'AGENTS.md');
      expect(rules.map((r) => r.text), `dropped: ${line}`).toContain(line);
    }
  });

  it('does NOT swallow descriptive prose that merely contains those verbs', () => {
    // The anchor is the safety mechanism. Matched anywhere, this list would turn every
    // statement of fact into an obligation — which is a false accusation waiting to happen,
    // and this project has now shipped ten classes of those.
    const { rules } = parseRuleset(
      `# Notes

The CI job will run the tests on every push. We check the digest afterwards.
The parser reads the file and returns a list. File naming is inconsistent here.
Test coverage is low in this module. State management is handled elsewhere.
`,
      'notes.md'
    );
    expect(rules.map((r) => r.text), 'descriptive prose became a rule').toEqual([]);
  });

  it('gives the same rule the same id whatever file it came from', () => {
    // Content-addressed ids are what make a per-rule track record survive a user moving
    // from CLAUDE.md to AGENTS.md — which, given AGENTS.md is the direction the ecosystem
    // is moving, is not hypothetical.
    const text = '- Never write to /etc/ directly.\n';
    const a = parseRuleset(text, 'CLAUDE.md').rules[0];
    const b = parseRuleset(text, 'AGENTS.md').rules[0];
    const c = parseRuleset(text, '.cursorrules').rules[0];
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);
    // …but the receipt still records where it came from, on `source`, so a track record
    // can say "this rule moved from CLAUDE.md to AGENTS.md and kept failing".
    expect([a.source.artifact, b.source.artifact, c.source.artifact]).toEqual([
      'CLAUDE.md',
      'AGENTS.md',
      '.cursorrules',
    ]);
  });
});
