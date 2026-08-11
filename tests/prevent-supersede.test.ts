import { describe, it, expect } from 'vitest';
import { propose, readyToOffer, needsDecision, type ExistingRule } from '../src/lib/prevent/supersede';
import type { PreferenceCandidate } from '../src/lib/preferences';

/**
 * The two failure modes here are not symmetric, and the tests are weighted accordingly.
 *
 * Silently keeping an abandoned rule is annoying and recoverable — the user sees it fire and
 * complains. Silently DROPPING a rule they deliberately set is unrecoverable, because nothing
 * tells them it happened; they simply stop being protected by something they believe is on.
 * Most of this file is about the second one.
 */

const cand = (rule: string, quote: string): PreferenceCandidate =>
  ({ id: rule, rule, quote, polarity: 'forbid', strength: 'medium', basis: 'test', start: 0, end: 0, check: 'judged', alreadyCovered: false }) as PreferenceCandidate;

const existing = (text: string, consequence: 'audited' | 'enforced' = 'audited'): ExistingRule =>
  ({ id: text, text, consequence, since: 'March', quote: 'the original words' });

describe('a contradiction is never resolved automatically', () => {
  it('holds back a reversal of an audited rule and quotes both sides', () => {
    const p = propose([cand('Always use spaces for indentation.', 'actually use spaces now')],
      [existing('Never use spaces for indentation.')], () => 5);
    expect(p[0].disposition.kind).toBe('contradicts');
    expect(p[0].message).toMatch(/Nothing has been changed or removed/);
    // Both sides quoted and dated, so the person can decide without going and looking.
    expect(p[0].message).toMatch(/set March/);
    expect(p[0].message).toMatch(/the original words/);
    expect(p[0].message).toMatch(/actually use spaces now/);
  });

  it('says plainly when the contradicted rule is one that BLOCKS things', () => {
    const p = propose([cand('Force-pushing is fine on my branches.', 'force push is fine now')],
      [existing('Never force-push to a shared branch.', 'enforced')], () => 9);
    expect(p[0].message).toMatch(/ENFORCED/);
    expect(p[0].message).toMatch(/blocks tool calls/);
    expect(p[0].message).toMatch(/will not be changed without you/);
  });

  it('repetition NEVER promotes a contradiction, however many times it is heard', () => {
    // Saying a new opinion twenty times is not evidence the old rule was wrong. Only the
    // person knows that. This is the single most important assertion in the file.
    for (const mentions of [2, 5, 20, 100]) {
      const p = propose([cand('Always use tabs.', 'tabs')], [existing('Never use tabs.', 'enforced')], () => mentions);
      expect(needsDecision(p), `promoted at ${mentions} mentions`).toHaveLength(1);
      expect(readyToOffer(p)).toHaveLength(0);
      if (p[0].disposition.kind === 'contradicts') expect(p[0].disposition.autoApplicable).toBe(false);
    }
  });
});

describe('the second mention is what promotes a NEW rule', () => {
  it('holds back a single remark', () => {
    const p = propose([cand('Never use emojis.', 'no emojis please')], [], () => 1);
    expect(readyToOffer(p)).toHaveLength(0);
    expect(p[0].message).toMatch(/a single remark is not a preference/);
  });

  it('offers it on the second', () => {
    const p = propose([cand('Never use emojis.', 'no emojis please')], [], () => 2);
    expect(readyToOffer(p)).toHaveLength(1);
  });
});

describe('duplicates and near-misses', () => {
  it('recognises an equivalent rule rather than proposing it again', () => {
    const p = propose([cand('Never use emojis.', 'x')], [existing('Never use emojis')], () => 3);
    expect(p[0].disposition.kind).toBe('duplicate');
  });

  it('does NOT call two unrelated rules a contradiction', () => {
    // A false conflict interrupts the user to arbitrate something that is not a conflict.
    // Do that twice and they click through without reading, and the mechanism is dead.
    const p = propose([cand('Never use emojis.', 'x')], [existing('Always cite sources with a link.')], () => 3);
    expect(p[0].disposition.kind).toBe('new');
  });

  it('does not treat two rules pointing the SAME way as a contradiction', () => {
    const p = propose([cand('Never use emojis in output.', 'x')], [existing('Never use emojis anywhere.')], () => 3);
    expect(needsDecision(p)).toHaveLength(0);
  });
});

/**
 * A reversal is almost never phrased as the negation of the original. "Never force-push to a
 * shared branch" gets abandoned by saying "force pushing is fine on my branches" — two shared
 * words after stemming, and no shared structure at all.
 *
 * So the matcher works on significant-word overlap. That is a real widening, and the tests
 * below hold both edges: it must catch the paraphrase, and it must still not invent conflicts
 * between rules that merely share vocabulary.
 */
describe('paraphrased reversals', () => {
  it('catches a reversal that shares no structure with the original', () => {
    const p = propose([cand('Force-pushing is fine on my branches.', 'force pushing is fine now')],
      [existing('Never force-push to a shared branch.', 'enforced')], () => 3);
    expect(p[0].disposition.kind).toBe('contradicts');
  });

  it('catches a short reversal, where only one significant word is shared', () => {
    const p = propose([cand('Always use tabs.', 'tabs now')], [existing('Never use tabs.')], () => 3);
    expect(p[0].disposition.kind).toBe('contradicts');
  });

  it('does not invent a conflict from shared vocabulary alone', () => {
    // Both mention branches. Neither reverses the other.
    const p = propose([cand('Never delete a branch without checking it is merged.', 'x')],
      [existing('Always name a branch after the issue number.')], () => 3);
    expect(needsDecision(p)).toHaveLength(0);
  });

  it('does not fire on rules about entirely different subjects', () => {
    const p = propose([cand('Always run the tests.', 'x')], [existing('Never use emojis.')], () => 3);
    expect(needsDecision(p)).toHaveLength(0);
  });
});
