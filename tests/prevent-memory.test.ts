import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMemory, saveMemory, noteMention, activeRules, alreadyDeclined, samePreference, type Memory } from '../src/lib/prevent/memory';
import { selfCheckable } from '../src/lib/prevent/supersede';
import type { PreferenceCandidate } from '../src/lib/preferences';

/**
 * Per-project memory: the version of "ever-learning" that ships without a privacy argument.
 * Semgrep sells exactly this shape — compounding value per organisation, no cross-tenant
 * flow — while Snyk and Semgrep have both promised publicly never to train on customer code.
 * It is a plain file in the user's own project so they can read, diff, commit or delete it.
 */
const fresh = () => mkdtempSync(join(tmpdir(), 'mem-'));
const empty = (): Memory => ({ version: 'memory@1.0.0', entries: [] });

describe('the same preference said differently counts as a repeat', () => {
  it('matches a rephrasing', () => {
    // The bug this pins: rule ids are content-addressed on exact text, so these keyed
    // differently, each stayed at one mention, and NEITHER reached the threshold. Saying
    // something twice did nothing at all.
    expect(samePreference('Never use emojis in your replies.', 'Never use emojis.')).toBe(true);
  });

  it('does NOT match a reversal as a repeat', () => {
    // A reversal must go down the supersession path, which requires a human. Absorbing it
    // as a repeat would be the silent-reversal failure in its purest form.
    expect(samePreference('Never use tabs.', 'Always use tabs.')).toBe(false);
  });

  it('does not match unrelated preferences', () => {
    expect(samePreference('Never use emojis.', 'Never force-push to main.')).toBe(false);
  });

  it('increments across phrasings rather than creating a second entry', () => {
    const m = empty();
    noteMention(m, 'a', 'Never use emojis in your replies.', 'q1', '2026-08-11');
    noteMention(m, 'b', 'Never use emojis.', 'q2', '2026-08-11');
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].mentions).toBe(2);
  });
});

describe('memory persists decisions', () => {
  it('round-trips through the file', () => {
    const dir = fresh();
    const m = empty();
    noteMention(m, 'a', 'Never use emojis.', 'q', '2026-08-11');
    saveMemory(m, dir);
    expect(loadMemory(dir).entries[0].rule).toBe('Never use emojis.');
  });

  it('remembers a decline so it is never re-proposed', () => {
    // Re-proposing something already refused is how a learning tool becomes exhausting,
    // and exhausting tools get switched off. A decline is a decision and it persists.
    const m: Memory = { version: 'memory@1.0.0', entries: [
      { id: 'x', rule: 'r', quote: 'q', firstSeen: '2026-01-01', mentions: 9, status: 'declined', consequence: 'audited' },
    ] };
    expect(alreadyDeclined(m, 'x')).toBeTruthy();
  });

  it('only accepted entries count as rules a new preference could undo', () => {
    const m: Memory = { version: 'memory@1.0.0', entries: [
      { id: 'a', rule: 'accepted rule', quote: 'q', firstSeen: '2026-01-01', mentions: 2, status: 'accepted', consequence: 'enforced' },
      { id: 'b', rule: 'merely proposed', quote: 'q', firstSeen: '2026-01-01', mentions: 2, status: 'proposed', consequence: 'audited' },
    ] };
    expect(activeRules(m).map((r) => r.id)).toEqual(['a']);
  });

  it('a corrupt memory file is never silently replaced with an empty one', () => {
    // Overwriting would erase every decision the user has made, invisibly. Read as empty for
    // this run; leave the file on disk so it can be recovered by hand.
    const dir = fresh();
    mkdirSync(join(dir, '.enforcee'), { recursive: true });
    writeFileSync(join(dir, '.enforcee/learned.json'), '{ this is not json');
    expect(loadMemory(dir).entries).toEqual([]);
    expect(readFileSync(join(dir, '.enforcee/learned.json'), 'utf8')).toBe('{ this is not json');
  });
});

describe('a rule we cannot check is not offered as ready', () => {
  const c = (check: string) => ({ check } as PreferenceCandidate);

  it('flags a judged-only rule as weak', () => {
    // Snyk runs its own fixes through its own scanner before showing them. Same idea: a rule
    // nothing can adjudicate reports NOT_APPLICABLE forever, which looks identical to a rule
    // being obeyed — manufacturing the exact false reassurance we exist to remove.
    const r = selfCheckable(c('judged'));
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/nothing in the engine can decide this one by code/);
  });

  it('passes a rule the deterministic layer can settle', () => {
    expect(selfCheckable(c('no_emoji')).ok).toBe(true);
  });
});

/**
 * A limitation worth pinning rather than hiding.
 *
 * A reversal phrased as a PERMISSION — "force pushing is fine on my branches" — is not
 * extracted as a preference at all, because the extractor looks for obligations and
 * prohibitions. So it never reaches the supersession check and no conflict is raised.
 *
 * This is the safe direction to fail: the old rule keeps protecting the user, and they see
 * it fire and can change it deliberately. But it means "I changed my mind" stated casually
 * will not be noticed, and that gap should be closed by widening extraction — not by
 * loosening supersession, which would start inventing conflicts.
 */
describe('known gap: permissions are not read as reversals', () => {
  it('is documented here so it is a decision, not an oversight', () => {
    expect(samePreference('Never force-push to a shared branch.', 'Force pushing is fine on my branches.')).toBe(false);
  });
});
