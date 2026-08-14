import { describe, expect, it } from 'vitest';
import { classify, parseRuleset, extractTrigger } from '../src/lib/rules/parse';
import { runDeterministic, guessLanguage } from '../src/lib/checks/deterministic';
import { runHealth } from '../src/lib/checks/health';
import { majority } from '../src/lib/checks/judge';
import { extractClaims, checkClaim } from '../src/lib/prevent/claims';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Rule } from '../src/lib/types';

/**
 * Second wave. Every case here was executed against the real engine by an independent
 * adversarial review and observed to produce the wrong verdict on a rule a real person
 * would plausibly write.
 */

function ruleOf(text: string): Rule {
  const { rules } = parseRuleset(`- ${text}`);
  expect(rules.length, `"${text}" was not parsed as a rule at all`).toBe(1);
  return rules[0];
}

function verdict(ruleText: string, output: string) {
  const rule = ruleOf(ruleText);
  const r = runDeterministic(rule, output);
  return { kind: rule.check.kind, verdict: r?.verdict ?? null, rationale: r?.rationale ?? '' };
}

describe('a negated ceiling is a ceiling, not a floor', () => {
  const short = 'The bug was a missing await in the retry helper. I added it and the flake is gone.';

  for (const rule of [
    "Don't use more than 200 words.",
    'Never write more than 150 words in a reply.',
    'Avoid using more than 100 words.',
    'Do not exceed 200 words.',
  ]) {
    it(`reads "${rule}" as a maximum`, () => {
      expect(classify(rule).kind).toBe('max_words');
      expect(verdict(rule, short).verdict).toBe('FOLLOWED');
    });
  }

  it('and a real floor is still a floor', () => {
    expect(classify('Write at least 200 words.').kind).toBe('min_words');
    expect(verdict('Write at least 200 words.', short).verdict).toBe('VIOLATED');
  });

  it('a genuine maximum still catches an overlong answer', () => {
    expect(verdict("Don't use more than 10 words.", 'one two three four five six seven eight nine ten eleven twelve').verdict).toBe('VIOLATED');
  });
});

describe('"the" is not a programming language', () => {
  const tagged = 'Here you go:\n\n```bash\nnpm run build\n```';

  for (const rule of ['Always tag code blocks with the language.', 'Tag code fences with the correct language.']) {
    it(`does not demand a fence tagged "the" for: ${rule}`, () => {
      const c = classify(rule);
      if (c.kind === 'code_fence_language') expect(['the', 'correct']).not.toContain(c.language);
      expect(verdict(rule, tagged).verdict).not.toBe('VIOLATED');
    });
  }

  it('still reads a named language', () => {
    const c = classify('Tag every code block with python.');
    expect(c.kind).toBe('code_fence_language');
    if (c.kind === 'code_fence_language') expect(c.language).toBe('python');
  });
});

describe('a rule about tagging code blocks is not a demand for code blocks', () => {
  it('does not accuse an answer that contains no code', () => {
    const r = verdict('Always tag code blocks with the language.', 'The service is already running on port 8080, so nothing to start.');
    expect(r.kind).toBe('code_fence_tagged');
    expect(r.verdict).toBe('NOT_APPLICABLE');
  });

  it('passes a tagged block and catches an untagged one', () => {
    expect(verdict('Always tag code blocks with the language.', 'Here:\n\n```bash\nnpm run build\n```').verdict).toBe('FOLLOWED');
    expect(verdict('Always tag code blocks with the language.', 'Here:\n\n```\nnpm run build\n```').verdict).toBe('VIOLATED');
  });

  it('a rule that genuinely demands a code block still does', () => {
    expect(verdict('Always include a code block in your answer.', 'No code needed here.').verdict).toBe('VIOLATED');
  });
});

describe('a contrast rule forbids the wrong form, it does not demand both', () => {
  it('does not accuse an answer that never touched the topic', () => {
    expect(verdict('Prefer `const` over `let`.', 'I renamed the CSS class and updated the snapshot.').verdict).not.toBe('VIOLATED');
  });

  it('and the forbidden half no longer satisfies the rule', () => {
    const rule = 'Use British spelling: "colour", not "color".';
    expect(verdict(rule, 'I updated the color tokens in the theme file.').verdict).toBe('VIOLATED');
    expect(verdict(rule, 'I updated the colour tokens in the theme file.').verdict).toBe('FOLLOWED');
    expect(verdict(rule, 'I updated the theme tokens.').verdict).toBe('FOLLOWED');
  });

  it('catches "can not" for a rule that asked for "cannot"', () => {
    expect(verdict('Write "cannot", not "can not".', 'You can not do that here.').verdict).toBe('VIOLATED');
  });

  it('a plain positive requirement is unchanged', () => {
    expect(verdict('Always include "Next steps" at the end.', 'All done.').verdict).toBe('VIOLATED');
  });
});

describe('a conditional rule is not violated by the condition never arising', () => {
  it('reads a trailing condition as a condition', () => {
    expect(extractTrigger('Use code blocks for shell commands')).toMatch(/for shell commands/i);
    expect(extractTrigger('Use a markdown table when comparing options')).toMatch(/when comparing options/i);
  });

  it('does not demand a code block from an answer with no commands in it', () => {
    expect(verdict('Use code blocks for shell commands.', 'The service is already running on port 8080, so nothing to start.').verdict).toBe('NOT_APPLICABLE');
  });

  it('nor a table from an answer that compared nothing', () => {
    expect(verdict('Use a markdown table when comparing options.', 'I fixed the typo in the README.').verdict).toBe('NOT_APPLICABLE');
  });

  it('but a forbidden thing that actually appears is still a violation', () => {
    expect(verdict('Never use emoji when writing commit messages.', 'Done 🎉').verdict).toBe('VIOLATED');
  });
});

describe('a limit on something that is not the answer', () => {
  it('says so instead of measuring the answer', () => {
    const r = verdict(
      'Keep the commit message under 72 characters.',
      'I refactored the retry helper so it uses exponential backoff, then updated the tests to cover the new jitter path.'
    );
    expect(r.verdict).toBe('UNVERIFIABLE');
    expect(r.rationale).toMatch(/not the text being audited|commit message/i);
  });

  it('and a per-section limit is measured per section', () => {
    const c = classify('Keep each section under 200 words.');
    expect(c.kind).toBe('max_words');
    if (c.kind === 'max_words') expect(c.scope).toBe('paragraph');
  });
});

describe('a citation is not only a URL', () => {
  it('accepts a file and line reference', () => {
    expect(
      verdict(
        'Always cite the file and line for every claim you make about the code.',
        'The timeout is set in src/lib/http.ts:42, and the retry count in src/lib/http.ts:58.'
      ).verdict
    ).toBe('FOLLOWED');
  });

  it('accepts a section reference', () => {
    expect(verdict('Cite the relevant SOP section in every response.', 'Per Section 4.2, the refund must be approved by a manager first.').verdict).toBe('FOLLOWED');
  });

  it('still fails an answer that cites nothing', () => {
    expect(verdict('Always cite sources with links.', 'Trust me on this one.').verdict).toBe('VIOLATED');
  });
});

describe('a heading name is the name, not the sentence', () => {
  it('does not build an unsatisfiable heading', () => {
    const c = classify('Add a section called Next Steps at the end of every response.');
    expect(c.kind).toBe('heading_required');
    if (c.kind === 'heading_required') expect(c.heading).toBe('Next Steps');
    expect(verdict('Add a section called Next Steps at the end of every response.', '## Next Steps\n\n- Deploy to staging.').verdict).toBe('FOLLOWED');
  });
});

describe('a forbidden word is a word', () => {
  it('does not swallow the rest of the clause into the needle', () => {
    const c = classify('Never use the word just when explaining code.');
    expect(c.kind).toBe('forbidden_literal');
    if (c.kind === 'forbidden_literal') expect(c.needles).toEqual(['just']);
    expect(verdict('Never use the word just when explaining code.', 'This is just a small change; just rerun the build.').verdict).toBe('VIOLATED');
  });

  it('same for a phrase rule', () => {
    expect(verdict('Avoid the word very in customer-facing copy.', 'The migration is very slow and very risky.').verdict).toBe('VIOLATED');
  });
});

describe('typographic marks are not emoji', () => {
  it('does not call a tick an emoji', () => {
    expect(verdict('No emojis in any response.', '✓ Tests pass\n✓ Lint clean\n→ Ready to merge').verdict).toBe('FOLLOWED');
    expect(verdict('Never use emojis.', 'Done ✔ the build is green.').verdict).toBe('FOLLOWED');
  });

  it('but a real emoji is still caught', () => {
    expect(verdict('Never use emojis.', 'Hello there 🎉 all good.').verdict).toBe('VIOLATED');
    expect(verdict('Never use emojis.', 'Shipped 🚀').verdict).toBe('VIOLATED');
  });
});

describe('English is detected as English', () => {
  it('on an a-dense but entirely ordinary answer', () => {
    const out =
      'Short answer: yes. A signed URL expires after 15 minutes, so a link shared by email will usually still work, but a link pasted into a ticket a day later will not. A refresh endpoint exists at /api/files/:id/url if a client needs a new one.';
    expect(guessLanguage(out)).toBe('en');
    expect(verdict('Always answer in English.', out).verdict).toBe('FOLLOWED');
  });

  it('and real Portuguese is still Portuguese', () => {
    expect(guessLanguage('Não consegui aceder ao servidor, mas quando tentei de novo funcionou. Também verifiquei os registos para confirmar isso.')).toBe('pt');
  });
});

describe('telling the truth about not doing something', () => {
  for (const prose of [
    'I have not created `tests/e2e.spec.ts` yet — tell me if you want it.',
    'I never wrote `scripts/deploy.sh` — that is handled by CI.',
    'I have not installed `left-pad` as a dependency.',
  ]) {
    it(`is not a claim: ${prose.slice(0, 40)}…`, () => {
      expect(extractClaims(prose)).toEqual([]);
    });
  }

  it('but a real claim is still read', () => {
    expect(extractClaims('I created `src/auth.ts` for you.').length).toBe(1);
  });
});

describe('a heuristic that drops a rule says so', () => {
  it('reports Title Case bullets it declined', () => {
    const text = [
      '# Support Handbook',
      '',
      '- Verify Customer Identity Before Refund',
      '- Escalate Sev-1 Incidents Immediately',
      '- Redact Card Numbers From Logs',
      '- Never promise a delivery date.',
    ].join('\n');
    const { rules } = parseRuleset(text);
    const f = runHealth(rules, text, 40).find((x) => x.code === 'lines_skipped');
    expect(f, 'obligations were dropped with no finding').toBeTruthy();
    expect(f!.message).toMatch(/not checked/i);
  });

  it('stays quiet on a ruleset where nothing was dropped', () => {
    const text = '- Never use emoji.\n- Always cite sources with links.\n';
    const { rules } = parseRuleset(text);
    expect(runHealth(rules, text, 20).some((x) => x.code === 'lines_skipped')).toBe(false);
  });
});

describe('a three-way split is not a verdict', () => {
  it('reports disagreement instead of whichever sample replied first', () => {
    const orders: ('FOLLOWED' | 'VIOLATED' | 'UNVERIFIABLE')[][] = [
      ['VIOLATED', 'FOLLOWED', 'UNVERIFIABLE'],
      ['FOLLOWED', 'VIOLATED', 'UNVERIFIABLE'],
      ['UNVERIFIABLE', 'FOLLOWED', 'VIOLATED'],
    ];
    for (const o of orders) expect(majority(o, 3).verdict).toBe('UNVERIFIABLE');
  });

  it('a real majority still decides', () => {
    expect(majority(['VIOLATED', 'VIOLATED', 'FOLLOWED'], 3).verdict).toBe('VIOLATED');
    expect(majority(['FOLLOWED', 'FOLLOWED', 'FOLLOWED'], 3).verdict).toBe('FOLLOWED');
  });

  it('and a two-way tie is also not a verdict', () => {
    expect(majority(['FOLLOWED', 'VIOLATED'], 2).verdict).toBe('UNVERIFIABLE');
  });
});

describe('a bare filename is not a wrong filename', () => {
  // FOUND BY RUNNING THIS PRODUCT ON OUR OWN SESSION TRANSCRIPT — the first finding from
  // dogfooding, and exactly the class real users will hit constantly. The sentence was
  // "I added `portability.test.ts` one commit ago"; the file is at tests/portability.test.ts;
  // the checker looked only at ./portability.test.ts and called a true statement a lie.
  const dir = mkdtempSync(join(tmpdir(), 'basename-'));

  it('finds a file referred to by name rather than by path', () => {
    mkdirSync(join(dir, 'tests'), { recursive: true });
    writeFileSync(join(dir, 'tests', 'portability.test.ts'), 'x');
    const r = checkClaim(
      { kind: 'file-created', subject: 'portability.test.ts', quote: 'I added `portability.test.ts` one commit ago.' },
      { cwd: dir }
    );
    expect(r.verdict).toBe('CONFIRMED');
    expect(r.evidence).toContain('tests');
  });

  it('still refutes a file that is genuinely nowhere', () => {
    expect(
      checkClaim({ kind: 'file-created', subject: 'never-written.ts', quote: 'I created `never-written.ts`.' }, { cwd: dir }).verdict
    ).toBe('REFUTED');
  });

  it('does not go hunting when a path was actually given', () => {
    // `src/portability.test.ts` names a location. It is wrong, and saying so is the point.
    expect(
      checkClaim({ kind: 'file-created', subject: 'src/portability.test.ts', quote: 'I created `src/portability.test.ts`.' }, { cwd: dir }).verdict
    ).toBe('REFUTED');
  });

  it('does not search outside the project', () => {
    expect(
      checkClaim({ kind: 'file-created', subject: 'passwd', quote: 'I created `passwd`.' }, { cwd: dir }).verdict
    ).toBe('REFUTED');
  });
});
