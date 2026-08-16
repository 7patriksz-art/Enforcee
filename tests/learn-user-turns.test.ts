import { describe, it, expect } from 'vitest';
import { userTurnsFromTranscript } from '@/lib/preferences';

/**
 * `role: "user"` is not the same claim as "the person typed this".
 *
 * Found 2026-08-15 by pointing `enforcee learn` at this project's own session transcript —
 * the first time the feature had ever been run on a real Claude Code session rather than on
 * a pasted conversation.
 *
 * TWO defects, stacked:
 *
 *  1. The CLI read the .jsonl as PROSE. `cli/index.ts` did `const text = read(args[1])` and
 *     handed the whole file to the extractor, so the assistant's code, commit messages and
 *     regexes were mined as the user's preferences. It proposed, as an actual rule:
 *
 *         Never = /^(and|or|the|a|an|of|in|for|with|to|&)$/i.
 *
 *     which is a regex out of src/lib/rules/parse.ts.
 *
 *     `userTurnsFromTranscript` already existed and already did the right thing. It was
 *     called by nothing but its own unit test. The test passed for a year of commits while
 *     the shipped binary ignored the function — a test that proved a property of a FUNCTION
 *     rather than of the PRODUCT.
 *
 *  2. Filtering on role was still not enough. Measured on that transcript: 150 records carry
 *     `type: "user"` and `role: "user"`. THREE are things the person typed (1,344 chars).
 *     ONE is 19,412 chars — the compaction summary, the assistant's own prose about its own
 *     work, re-injected wearing the user's role. So 93% of the corpus was still the machine.
 *
 * The website says "Only your words are read — never the assistant's". That was false in the
 * binary people install. These tests are what make it true.
 */

/** The exact record shapes observed in a real Claude Code transcript. */
const HUMAN = {
  type: 'user',
  message: { role: 'user', content: 'Always reply in British English and never use an em-dash.' },
};
const COMPACT_SUMMARY = {
  type: 'user',
  isCompactSummary: true,
  message: {
    role: 'user',
    content:
      'This session is being continued from a previous conversation. Summary: the templates were ' +
      'never bundled into a Vercel function, and notify() never throws.',
  },
};
const HOOK_OUTPUT = {
  type: 'user',
  isMeta: true,
  message: { role: 'user', content: 'Stop hook feedback:\n[~/.claude/stop-hook-git-check.sh]: There are 5 unpushed commit(s)' },
};
const ASSISTANT = {
  type: 'assistant',
  message: { role: 'assistant', content: 'Never let a check silently cover nothing.' },
};
const SYSTEM_REMINDER = {
  type: 'user',
  message: { role: 'user', content: '<system-reminder>Always prefer the Read tool.</system-reminder>' },
};
const TOOL_RESULT = {
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', content: 'never throws' }] },
};
const SLASH_COMMAND = {
  type: 'user',
  message: { role: 'user', content: '<command-name>/compact</command-name>' },
};

describe('only the human turns are mined', () => {
  const ALL = [HUMAN, COMPACT_SUMMARY, HOOK_OUTPUT, ASSISTANT, SYSTEM_REMINDER, TOOL_RESULT, SLASH_COMMAND];

  it('keeps what the person actually typed', () => {
    expect(userTurnsFromTranscript(ALL)).toContain('British English');
  });

  it('drops the compaction summary — 93% of the corpus, and none of it theirs', () => {
    // The one that mattered most. It wears role:"user" and is the largest record in the file.
    const out = userTurnsFromTranscript(ALL);
    expect(out, 'the compaction summary is being mined as the user').not.toMatch(
      /bundled into a Vercel function|never throws/
    );
  });

  it('drops hook output injected as a user turn', () => {
    expect(userTurnsFromTranscript(ALL), 'isMeta hook output is being mined').not.toMatch(/Stop hook feedback/);
  });

  it('drops the assistant, system reminders, tool results and slash commands', () => {
    const out = userTurnsFromTranscript(ALL);
    expect(out, "the assistant's own words are being mined").not.toMatch(/silently cover nothing/);
    expect(out).not.toMatch(/prefer the Read tool/);
    expect(out).not.toMatch(/command-name/);
  });

  it('keeps ONLY the human turn — nothing else survives', () => {
    // Stated as an exact equality rather than a list of absences. A new channel of machine
    // text under the user role would slip past every `not.toMatch` above; it cannot slip
    // past this.
    expect(userTurnsFromTranscript(ALL)).toBe(HUMAN.message.content);
  });

  it('reports nothing rather than everything when a transcript has no human turns', () => {
    // A silent empty string here is what "no preferences found" looks like, which reads
    // identical to "your rules are all satisfied". The CLI turns this into an explicit
    // refusal; this pins that the input to that decision is genuinely empty.
    const machineOnly = [COMPACT_SUMMARY, HOOK_OUTPUT, ASSISTANT, SYSTEM_REMINDER];
    expect(userTurnsFromTranscript(machineOnly)).toBe('');
  });
});
