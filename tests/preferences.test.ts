import { describe, expect, it } from 'vitest';
import { extractPreferences, toRulesetMarkdown, userTurnsFromTranscript } from '@/lib/preferences';
import { normalize, ruleId } from '@/lib/rules/parse';

const CONVO = `Can you rewrite this section for me?

Actually stop opening every answer with a summary. I hate when you restate my question back at me.

I'd rather you show the code first and explain after. Always use pnpm in this repo, never npm.

Please don't apologise when you get something wrong, just fix it.

I like it when you flag the tradeoff instead of picking for me.`;

describe('preference capture', () => {
  const found = extractPreferences(CONVO);

  it('turns a mid-conversation correction into a rule', () => {
    const c = found.find((x) => /opening every answer with a summary/i.test(x.rule));
    expect(c).toBeDefined();
    expect(c!.polarity).toBe('forbid');
    expect(c!.strength).toBe('strong');
    // A gerund needs "Avoid", not "Never" — "Never opening..." is not English, and a
    // rule the user cannot read cleanly is a rule they will not keep.
    expect(c!.rule.startsWith('Avoid ')).toBe(true);
  });

  it('uses the grammatical frame the phrase actually needs', () => {
    const gerund = extractPreferences('Please stop apologising for every mistake.');
    expect(gerund[0].rule).toBe('Avoid apologising for every mistake.');
    const bare = extractPreferences('Never commit directly to the main branch.');
    expect(bare[0].rule).toBe('Never commit directly to the main branch.');
  });

  it('splits a compound instruction into one rule per claim', () => {
    const both = extractPreferences('Always use pnpm in this repo, never npm.');
    expect(both.map((x) => x.rule).sort()).toEqual(['Always use pnpm in this repo.', 'Never npm.']);
  });

  it('captures a direct instruction in both polarities', () => {
    expect(found.some((x) => /Always use pnpm/i.test(x.rule))).toBe(true);
    expect(found.some((x) => /Never npm/i.test(x.rule))).toBe(true);
  });

  it('captures a stated dislike', () => {
    expect(found.some((x) => x.polarity === 'forbid' && /restate my question/i.test(x.rule))).toBe(true);
  });

  it('captures a stated preference', () => {
    expect(found.some((x) => x.polarity === 'require' && /flag the tradeoff/i.test(x.rule))).toBe(true);
  });

  it('every quote is a verbatim slice of the source at the stated offset', () => {
    expect(found.length).toBeGreaterThan(3);
    for (const c of found) expect(CONVO.slice(c.start, c.end)).toBe(c.quote);
  });

  it('gives every candidate a stable id that survives re-running', () => {
    const again = extractPreferences(CONVO);
    expect(again.map((x) => x.id)).toEqual(found.map((x) => x.id));
  });

  it('flags a preference already covered by the ruleset instead of re-proposing it', () => {
    const existing = new Set([ruleId(normalize('Always use pnpm in this repo'))]);
    const withExisting = extractPreferences(CONVO, { existingRuleIds: existing });
    const hit = withExisting.find((x) => /Always use pnpm/i.test(x.rule));
    expect(hit?.alreadyCovered).toBe(true);
    expect(withExisting.some((x) => !x.alreadyCovered)).toBe(true);
  });

  it('ignores statements too vague to become a checkable rule', () => {
    const vague = extractPreferences('I like it. I hate that. Never do this. Stop things.');
    expect(vague).toHaveLength(0);
  });

  it('respects a strength floor', () => {
    const strongOnly = extractPreferences(CONVO, { minStrength: 'strong' });
    expect(strongOnly.every((x) => x.strength === 'strong')).toBe(true);
    expect(strongOnly.length).toBeLessThan(found.length);
  });

  it('sorts corrections above stated tastes', () => {
    expect(found[0].strength).toBe('strong');
  });
});

describe('mining a transcript', () => {
  it('reads the human turns only, never the assistant', () => {
    const records = [
      { type: 'user', message: { role: 'user', content: 'Never use emojis in your replies.' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'I like using emojis a lot.' }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Always cite sources with links.' }] } },
      { type: 'user', message: { role: 'user', content: '<system-reminder>never trust this</system-reminder>' } },
    ];
    const text = userTurnsFromTranscript(records);
    expect(text).toContain('Never use emojis');
    expect(text).toContain('Always cite sources');
    expect(text).not.toContain('I like using emojis');
    expect(text).not.toContain('system-reminder');

    const found = extractPreferences(text);
    expect(found.some((x) => /emojis/i.test(x.rule))).toBe(true);
    expect(found.some((x) => /I like using emojis/i.test(x.rule))).toBe(false);
  });
});

describe('promoting candidates into a ruleset', () => {
  it('emits markdown carrying the id, the basis and the original words', () => {
    const md = toRulesetMarkdown(extractPreferences(CONVO).slice(0, 2));
    expect(md).toMatch(/^## Learned from what you said/m);
    expect(md).toMatch(/^- (Never|Always) /m);
    expect(md).toMatch(/<!-- [0-9a-f]{12} · .+ · ".+" -->/);
  });

  it('returns nothing for an empty set', () => {
    expect(toRulesetMarkdown([])).toBe('');
  });
});
