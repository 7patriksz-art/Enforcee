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

/**
 * The scheduled task's own prompt, verbatim in shape from the 08:00 LEARN run on 2026-08-18.
 *
 * This is the channel that makes the tool agree with itself. In a scheduled cloud container
 * the ONLY transcript under ~/.claude/projects is the run's own — Patrik's real sessions are
 * on his machine and READ-MY-SESSIONS.md records that ~/.claude cannot be granted to a cloud
 * session. So this single record was 4,137 of the 4,137 prose characters `enforcee learn`
 * analysed: the corpus was the agent's own orders, and the CLI printed a percentage while
 * reporting it.
 *
 * Note what it is NOT: it does not start with `<task-notification>`, which is the tag the
 * text filter names. Provenance is in `origin.kind`, and until now nothing read it.
 */
const SCHEDULED_TASK_PROMPT = {
  type: 'user',
  origin: { kind: 'task-notification', subkind: 'scheduled-trigger' },
  entrypoint: 'remote_cowork_trigger',
  message: {
    role: 'user',
    content:
      'You are the LEARN station. Never reword a claim to avoid a duplicate. ' +
      'Always file a finding with evidence.',
  },
};

describe('only the human turns are mined', () => {
  const ALL = [
    HUMAN,
    COMPACT_SUMMARY,
    HOOK_OUTPUT,
    ASSISTANT,
    SYSTEM_REMINDER,
    TOOL_RESULT,
    SLASH_COMMAND,
    SCHEDULED_TASK_PROMPT,
  ];

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

  it("drops a scheduled task's own prompt, which arrives wearing the user's role", () => {
    // The imperatives in that prompt are exactly the shape `extractPreferences` mines:
    // "Never reword...", "Always file...". Mined, they come back to Patrik as things HE
    // asked for, when they are things we told ourselves.
    const out = userTurnsFromTranscript(ALL);
    expect(out, "the scheduled task's own prompt is being mined as the user").not.toMatch(
      /LEARN station|reword a claim|file a finding/
    );
  });

  it('a scheduled run alone on disk yields an empty corpus, not a confident one', () => {
    // The measured state of a scheduled container: one transcript, and it is this run's.
    // Empty is the only honest answer, and the CLI turns empty into an explicit refusal.
    expect(userTurnsFromTranscript([SCHEDULED_TASK_PROMPT, TOOL_RESULT, ASSISTANT])).toBe('');
  });

  it('excludes it on the structured field, not on how the text happens to begin', () => {
    // NOT_THE_PERSON_SPEAKING lists '<task-notification>' by name, so this channel was known
    // and meant to be excluded. It was excluded by a prefix match the real record does not
    // satisfy. Pin the distinction, or the fix silently reverts to the sniff that failed.
    expect(SCHEDULED_TASK_PROMPT.message.content.trimStart().startsWith('<task-notification>')).toBe(false);
    const untagged = { ...SCHEDULED_TASK_PROMPT, origin: undefined };
    expect(userTurnsFromTranscript([untagged]), 'only the text filter is doing the work').not.toBe('');
    expect(userTurnsFromTranscript([SCHEDULED_TASK_PROMPT])).toBe('');
  });
});
