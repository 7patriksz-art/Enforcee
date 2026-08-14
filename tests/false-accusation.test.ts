import { describe, expect, it } from 'vitest';
import { classify, parseRuleset } from '../src/lib/rules/parse';
import { runDeterministic, segments, findJsonBlock } from '../src/lib/checks/deterministic';
import type { Rule } from '../src/lib/types';

/**
 * A false accusation is the worst output this product can produce. "Zero false
 * accusations" is on the landing page, and a VIOLATED carrying a deterministic badge is
 * the strongest claim we make — it says a machine proved it.
 *
 * Every case here was a real VIOLATED against an output that obeyed the rule.
 */

function ruleOf(text: string): Rule {
  const { rules } = parseRuleset(`- ${text}`);
  expect(rules.length, `"${text}" was not parsed as a rule at all`).toBe(1);
  return rules[0];
}

function verdict(ruleText: string, output: string) {
  const rule = ruleOf(ruleText);
  const r = runDeterministic(rule, output);
  return { kind: rule.check.kind, verdict: r?.verdict ?? null, rationale: r?.rationale ?? '', result: r };
}

describe('a path is not a regex', () => {
  it('does not read /etc/ in prose as the pattern "etc"', () => {
    const c = classify('Never write to /etc/ or /tmp/ directly.');
    expect(c.kind).not.toBe('forbidden_regex');
  });

  it('the old reading accused every answer that used the word "fetch"', () => {
    // /etc/ -> /etc/ -> "etc" -> matches inside "fetch", "sketch", "wretched".
    const v = verdict('Never write to /etc/ or /tmp/ directly.', 'I used fetch() to load the config.');
    expect(v.verdict).not.toBe('VIOLATED');
  });

  it('still reads a deliberate pattern, which has metacharacters', () => {
    expect(classify('Output must match /^SUMMARY:/ exactly.').kind).toBe('required_regex');
    expect(classify('Never emit text matching /TODO:\\s*$/.').kind).toBe('forbidden_regex');
  });

  it('still reads a pattern with explicit flags', () => {
    const c = classify('Never output /password/i anywhere.');
    expect(c.kind).toBe('forbidden_regex');
    if (c.kind === 'forbidden_regex') expect(c.flags).toBe('i');
  });

  it('still reads a pattern the rule calls a pattern', () => {
    expect(classify('Reject anything matching the pattern /debug/.').kind).toBe('forbidden_regex');
  });

  it('leaves a bare unix path to the literal and judged paths', () => {
    for (const t of ['Do not touch /usr/ at all.', 'Config lives in /opt/ on every host.']) {
      expect(classify(t).kind, t).not.toMatch(/regex/);
    }
  });
});

describe('"source" is not a citation', () => {
  const notCitations = [
    'Always use the source of truth in config.ts.',
    'Always keep the source code formatted.',
    'Always provide a reference implementation for new APIs.',
    'Always add the data source name to the log line.',
    'Always keep a single source for pricing.',
  ];

  for (const t of notCitations) {
    it(`does not demand a URL for: ${t}`, () => {
      expect(classify(t).kind).not.toBe('citation_required');
    });
  }

  it('an answer with no links is not VIOLATED for mentioning a source of truth', () => {
    const v = verdict('Always use the source of truth in config.ts.', 'Read it from config.ts, which is the source of truth.');
    expect(v.verdict).not.toBe('VIOLATED');
  });

  const areCitations = [
    'Always cite sources with links.',
    'Always cite your sources.',
    'Include a link to the original documentation.',
    'End with references for every claim.',
    'Provide sources for each figure you quote.',
  ];

  for (const t of areCitations) {
    it(`still recognises: ${t}`, () => {
      expect(classify(t).kind).toBe('citation_required');
    });
  }
});

describe('a per-bullet limit is measured per bullet', () => {
  const rule = 'Keep each bullet under 12 words.';

  it('parses the scope out of the rule', () => {
    const c = classify(rule);
    expect(c.kind).toBe('max_words');
    if (c.kind === 'max_words') expect(c.scope).toBe('bullet');
  });

  it('does not accuse an answer whose bullets are all short', () => {
    const output = ['- First point, short and well within the limit.', '- Second point, also short.', '- Third point here.'].join('\n');
    const v = verdict(rule, output);
    expect(v.verdict).toBe('FOLLOWED');
    // The whole output is 20 words, which is what the old checker measured.
    expect(output.split(/\s+/).length).toBeGreaterThan(12);
  });

  it('still catches the bullet that is actually too long, and quotes it', () => {
    const output = ['- Short one.', `- ${'word '.repeat(20).trim()}`].join('\n');
    const v = verdict(rule, output);
    expect(v.verdict).toBe('VIOLATED');
    expect(v.result!.evidence.length).toBe(1);
    expect(v.result!.evidence[0].quote.startsWith('word')).toBe(true);
  });

  it('says the rule never applied when there are no bullets at all', () => {
    expect(verdict(rule, 'A plain paragraph with no list in it whatsoever.').verdict).toBe('NOT_APPLICABLE');
  });

  it('a whole-output limit is still measured over the whole output', () => {
    const c = classify('Keep every answer under 120 words.');
    expect(c.kind).toBe('max_words');
    if (c.kind === 'max_words') expect(c.scope).toBe('output');
  });

  it('does not count code inside a fence as a bullet', () => {
    const output = ['- Run the script.', '```bash', 'echo one two three four five six seven eight nine ten eleven twelve thirteen', '```'].join('\n');
    expect(verdict(rule, output).verdict).toBe('FOLLOWED');
  });

  it('evidence offsets are literally correct', () => {
    const output = ['- ok', `- ${'x '.repeat(30).trim()}`].join('\n');
    const r = runDeterministic(ruleOf(rule), output)!;
    for (const e of r.evidence) expect(output.slice(e.start, e.end)).toBe(e.quote);
  });
});

describe('segments', () => {
  it('keeps offsets that address the original string', () => {
    const s = 'One. Two two. Three three three.';
    for (const scope of ['sentence', 'line', 'paragraph'] as const) {
      for (const seg of segments(s, scope)) expect(s.slice(seg.start, seg.end)).toBe(seg.text);
    }
  });

  it('strips the bullet marker but not the words', () => {
    const segs = segments('- alpha beta\n* gamma', 'bullet');
    expect(segs.map((s) => s.text)).toEqual(['alpha beta', 'gamma']);
  });
});

describe('JSON in an explanation still counts as JSON', () => {
  it('accepts a fenced block when the rule did not ask for JSON only', () => {
    const out = 'Here is the config you asked for:\n\n```json\n{"a": 1}\n```\n\nLet me know if you want it flattened.';
    const v = verdict('Return the config as JSON.', out);
    expect(v.verdict).toBe('FOLLOWED');
    expect(v.result!.evidence[0].quote).toContain('"a"');
  });

  it('accepts an unfenced object that starts a line', () => {
    expect(verdict('Return the config as JSON.', 'Here it is:\n\n{"a": 1}\n').verdict).toBe('FOLLOWED');
  });

  it('but a number list inside a sentence is not a JSON answer', () => {
    // "the retry counts I saw were [1, 2, 3]" made a pure-prose answer pass a JSON rule —
    // a false pass on the strongest badge the product issues.
    const prose = 'I could not reach the API, so I have nothing structured. The retry counts were [1, 2, 3] before it gave up.';
    expect(verdict('Respond in valid JSON.', prose).verdict).toBe('VIOLATED');
    expect(verdict('Always return the results as JSON.', 'No results found. Check the filters: {"status": "open"} is what I used.').verdict).toBe('VIOLATED');
  });

  it('holds the line when the rule says JSON and nothing else', () => {
    const c = classify('Reply with nothing but JSON.');
    expect(c.kind).toBe('format_json');
    if (c.kind === 'format_json') expect(c.strict).toBe(true);
    const v = verdict('Reply with nothing but JSON.', 'Sure!\n\n```json\n{"a": 1}\n```');
    expect(v.verdict).toBe('VIOLATED');
    expect(v.rationale).toMatch(/nothing else|JSON and nothing/i);
  });

  it('a whole-output JSON answer passes either way', () => {
    expect(verdict('Reply with nothing but JSON.', '{"a": 1}').verdict).toBe('FOLLOWED');
    expect(verdict('Respond in valid JSON.', '{"a": 1}').verdict).toBe('FOLLOWED');
  });

  it('still fails when there is no JSON anywhere', () => {
    expect(verdict('Respond in valid JSON.', 'No structured data here, sorry.').verdict).toBe('VIOLATED');
  });

  it('does not hand JSON.parse a truncated slice', () => {
    // An unbalanced brace must not be mistaken for a value.
    expect(findJsonBlock('the shape is { "a": 1 and then it stops')).toBeNull();
  });

  it('finds the JSON even when an earlier brace run is not JSON', () => {
    const found = findJsonBlock('use ${HOME}, then apply:\n{"ok": true}\n');
    expect(found).not.toBeNull();
    expect(found!.quote).toBe('{"ok": true}');
  });
});
