import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPreferences } from '../src/lib/preferences';
import { propose, readyToOffer, needsDecision, needsReview, selfCheckable, existingFromRuleset, type ExistingRule } from '../src/lib/prevent/supersede';
import { loadMemory, saveMemory, noteMention, activeRules, decide } from '../src/lib/prevent/memory';
import { classify, parseRuleset } from '../src/lib/rules/parse';

/**
 * Learning is the part of this product that can do real damage.
 *
 * A rule someone deliberately set — possibly one blocking commands in their guard — must
 * never stop being enforced because a passing remark was read as a reversal. And the
 * mechanism that prevents that has to actually run, which for a long time it did not.
 */

const cand = (text: string) => {
  const found = extractPreferences(text);
  expect(found.length, `nothing extracted from: ${text}`).toBeGreaterThan(0);
  return found;
};

const existing = (text: string, consequence: 'audited' | 'enforced' = 'audited'): ExistingRule => ({
  id: 'e1',
  text,
  consequence,
});

describe('a conflict must be a real conflict', () => {
  it('does not pit two ways of saying the same thing against each other', () => {
    // Both forbid deploying without approval. The first scores negative twice ("not",
    // "without"), the second positive, and they share "deploy" and "approval".
    const p = propose(cand('Always get approval before you deploy.'), [existing('Do not deploy without approval.')], () => 2);
    expect(needsDecision(p)).toEqual([]);
  });

  it('same again with the clause leading', () => {
    const p = propose(cand('Always run the linter.'), [existing('Before you commit, always run the linter.')], () => 2);
    expect(needsDecision(p)).toEqual([]);
  });

  it('still catches a real reversal', () => {
    const p = propose(cand('I prefer force-pushing to my own branches.'), [existing('Never force-push to a shared branch.', 'enforced')], () => 2);
    const conflicts = needsDecision(p);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].message).toMatch(/ENFORCED/);
    expect(conflicts[0].message).toMatch(/nothing was removed|Nothing has been changed/i);
  });

  it('a contradiction is never promoted by repetition', () => {
    const p = propose(cand('I prefer force-pushing to my own branches.'), [existing('Never force-push to a shared branch.')], () => 99);
    expect(readyToOffer(p)).toEqual([]);
  });
});

describe('a permission is not an instruction', () => {
  it('does not turn "you can always X" into "Always X"', () => {
    const found = extractPreferences('You can always force-push to my feature branches.');
    for (const c of found) {
      expect(c.polarity, `"${c.rule}" was made an obligation`).not.toBe('require');
      expect(c.rule).not.toMatch(/^Always force-push/);
    }
  });

  it('and never offers one as a rule, however many times it is said', () => {
    const found = extractPreferences("It's fine to always skip the changelog on patch releases.");
    const p = propose(found, [], () => 5);
    expect(readyToOffer(p)).toEqual([]);
  });

  it('but raises it against the rule it would lift', () => {
    const found = extractPreferences('You can always force-push to my feature branches.');
    const p = propose(found, [existing('Never force-push to a feature branch.', 'enforced')], () => 1);
    const decisions = needsDecision(p);
    expect(decisions.length).toBe(1);
    expect(decisions[0].message).toMatch(/permission is not a rule/i);
    expect(decisions[0].message).toMatch(/nothing was removed/i);
  });

  it('a genuine instruction is still an instruction', () => {
    const found = extractPreferences('Always run the tests before you tell me it works.');
    expect(found.some((c) => c.polarity === 'require')).toBe(true);
  });
});

describe('a wider rule is not a duplicate of a narrower one', () => {
  it('surfaces the widening instead of swallowing it', () => {
    const p = propose(cand('I hate emoji.'), [existing('Avoid emoji in commit messages.')], () => 2);
    expect(p[0].disposition.kind).not.toBe('duplicate');
  });

  it('and says which direction it went', () => {
    const p = propose(cand('Never use emoji in commit messages.'), [existing('Never use emoji.')], () => 2);
    const seen = [...needsReview(p), ...p.filter((x) => x.disposition.kind === 'refines')];
    if (seen.length) expect(seen[0].message).toMatch(/narrower|wider/i);
  });

  it('a true restatement is still a duplicate', () => {
    const p = propose(cand('Never use emoji.'), [existing('Never use emoji.')], () => 2);
    expect(p[0].disposition.kind).toBe('duplicate');
  });
});

describe('selfCheckable does not manufacture reassurance', () => {
  it('refuses to call an action rule checkable by code', () => {
    const c = { check: 'action' as const } as Parameters<typeof selfCheckable>[0];
    const r = selfCheckable(c);
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/enforcee verify|environment/);
  });

  it('still passes a real deterministic check', () => {
    const c = { check: 'no_emoji' as const } as Parameters<typeof selfCheckable>[0];
    expect(selfCheckable(c).ok).toBe(true);
  });
});

describe('a rule about words is not a rule about actions', () => {
  it('classifies `Never call a defect a "bug"` as text, not an unverifiable action', () => {
    const c = classify('Never call a defect a "bug".');
    expect(c.kind).toBe('forbidden_literal');
    if (c.kind === 'forbidden_literal') expect(c.needles).toContain('bug');
  });

  it('still routes a real action rule to the environment', () => {
    expect(classify('Always run the migration before deploying.').kind).toBe('action');
    expect(classify('Escalate to the on-call engineer within 15 minutes.').kind).toBe('action');
  });
});

describe('mentions are mentions, not runs', () => {
  it('re-reading the same sentence does not make it a pattern', () => {
    const memory = { version: 'v', entries: [] as ReturnType<typeof noteMention>[] };
    const mem = { version: 'v', entries: [] } as Parameters<typeof noteMention>[0];
    noteMention(mem, 'id1', 'Never use emoji.', 'I hate emoji', '2026-08-12', 'occ-a');
    noteMention(mem, 'id1', 'Never use emoji.', 'I hate emoji', '2026-08-12', 'occ-a');
    noteMention(mem, 'id1', 'Never use emoji.', 'I hate emoji', '2026-08-12', 'occ-a');
    expect(mem.entries[0].mentions).toBe(1);
    expect(memory.entries.length).toBe(0);
  });

  it('but saying it again in a different place does', () => {
    const mem = { version: 'v', entries: [] } as Parameters<typeof noteMention>[0];
    noteMention(mem, 'id1', 'Never use emoji.', 'I hate emoji', '2026-08-12', 'occ-a');
    noteMention(mem, 'id1', 'Never use emojis in replies.', 'stop with the emoji', '2026-08-13', 'occ-b');
    expect(mem.entries[0].mentions).toBe(2);
  });
});

describe('supersession is reachable', () => {
  it('a decision actually changes the status, and activeRules then sees it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-'));
    const mem = loadMemory(dir);
    noteMention(mem, 'abc123def456', 'Never use emoji.', 'I hate emoji', '2026-08-12', 'o1');
    saveMemory(mem, dir);

    expect(activeRules(loadMemory(dir))).toEqual([]);

    const reloaded = loadMemory(dir);
    expect(decide(reloaded, 'abc123de', 'accepted')).toBeTruthy();
    saveMemory(reloaded, dir);

    const active = activeRules(loadMemory(dir));
    expect(active.length).toBe(1);
    expect(active[0].text).toBe('Never use emoji.');
  });

  it('nothing is deleted by a decline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem2-'));
    const mem = loadMemory(dir);
    noteMention(mem, 'ffff0000', 'Never use emoji.', 'I hate emoji', '2026-08-12', 'o1');
    decide(mem, 'ffff0000', 'declined', 'changed my mind');
    saveMemory(mem, dir);
    const back = loadMemory(dir);
    expect(back.entries.length).toBe(1);
    expect(back.entries[0].status).toBe('declined');
    expect(back.entries[0].note).toBe('changed my mind');
  });

  it('rules from the user own ruleset are what a preference is measured against', () => {
    const { rules } = parseRuleset('- Never force-push to a shared branch.\n- Always run the tests.');
    const ex = existingFromRuleset(rules, new Set([rules[0].id]));
    expect(ex.length).toBe(2);
    expect(ex[0].consequence).toBe('enforced');
    expect(ex[1].consequence).toBe('audited');

    const p = propose(cand('I prefer force-pushing to my own branches.'), ex, () => 2);
    expect(needsDecision(p).length).toBe(1);
  });
});
