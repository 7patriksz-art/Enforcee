import { describe, expect, it } from 'vitest';
import {
  buildBrief,
  extractPreconditions,
  extractRequirements,
  normalise,
  proposeAcceptance,
} from '@/lib/brief/extract';

/**
 * STEP 1 OF THE LOOP: read the prompt.
 *
 * Patrik, 2026-08-17: *"read the prompt, plan with everything in advance, count with all the
 * possible outputs, ideally leave the human labour out, avoiding back and forth, learning and
 * improving guards, preference, enforcements along the way and verify very thoroughly at the
 * end if everything's green, if not solve that."*
 *
 * Before this, no Enforcee command took a prompt as input at all. `audit` graded an output
 * after the fact; nothing read the request that produced it. Four of those six steps did not
 * exist.
 *
 * The fixtures below are HIS ACTUAL PROMPTS from this project, not invented ones. A prompt
 * parser tested only on prompts written to please it is the mirror pattern with a new face.
 */

// Verbatim, from 2026-08-17.
const REAL_PROMPT = `ran the publish to npm but all failed. How can it be that enforcee is not working, we wasted then a lot of time. Make it work! There is so much errors to analyze. Once everythings okay and we have an mvp enforcee we should start marketing and distrubution. Clean up everything, verify if everythings green. Make a few tests in project with the installed enforcee to make sure first.`;

const COMMAND_PROMPT = `Ship the release.

- Run \`npm test\` and make sure it is green on all three platforms.
- Then run \`npm run pack:cli\` before publishing.
- Never create a release tag by hand.

Did the windows leg pass?`;

describe('a prompt becomes an itemised list of what was asked', () => {
  it('finds the real asks in a real prompt', () => {
    const reqs = extractRequirements(REAL_PROMPT);
    expect(reqs.length, 'a prompt full of requests yielded nothing').toBeGreaterThan(3);
    const all = reqs.map((r) => r.text).join(' | ');
    for (const asked of ['Make it work', 'Clean up everything', 'verify if everythings green']) {
      expect(all, `missed a request the prompt plainly makes: "${asked}"`).toContain(asked);
    }
  });

  it('separates a constraint from an action, because they are checked differently', () => {
    const reqs = extractRequirements(COMMAND_PROMPT);
    const tag = reqs.find((r) => /release tag by hand/.test(r.text));
    expect(tag, 'the "never" line was not read as a requirement at all').toBeDefined();
    expect(tag!.kind, 'a prohibition was filed as an action').toBe('constraint');
    expect(reqs.find((r) => /Run `npm test`/.test(r.text))?.kind).toBe('do');
  });

  it('reads a question as a deliverable, because answering it is the work', () => {
    const q = extractRequirements(COMMAND_PROMPT).find((r) => r.kind === 'question');
    expect(q, 'a direct question in the prompt was dropped').toBeDefined();
    expect(q!.text).toMatch(/windows leg/i);
  });

  it('ignores headings, fences and rules, so the list is requests only', () => {
    const reqs = extractRequirements('# Title\n\n```\nnpm run build\n```\n\n---\n');
    expect(reqs, 'markdown furniture was read as a request').toEqual([]);
  });

  it('gives every requirement a stable, content-addressed id', () => {
    // The same prompt must produce the same ids, or nothing downstream can track a
    // requirement across runs — and "did we do this yesterday" becomes unanswerable.
    const a = extractRequirements(COMMAND_PROMPT).map((r) => r.id);
    const b = extractRequirements(COMMAND_PROMPT).map((r) => r.id);
    expect(a).toEqual(b);
    expect(new Set(a).size, 'ids collided, so two requirements are indistinguishable').toBe(a.length);
  });

  it('cites the line, so a person can check the reading', () => {
    for (const r of extractRequirements(COMMAND_PROMPT)) {
      expect(r.line, `${r.id} has no line`).toBeGreaterThan(0);
    }
  });
});

describe('and an itemised list of what the work will need', () => {
  it('finds tools, keys and files named in the prompt', () => {
    const pre = extractPreconditions('Run `npm test`, then push with $GITHUB_TOKEN and edit src/lib/plans.ts');
    const kinds = pre.map((p) => `${p.kind}:${p.target}`);
    expect(kinds).toContain('binary:npm');
    expect(kinds).toContain('env:GITHUB_TOKEN');
    expect(kinds).toContain('file:src/lib/plans.ts');
  });

  it('never lists the same prerequisite twice', () => {
    const pre = extractPreconditions('npm this and npm that and npm the other');
    expect(pre.filter((p) => p.target === 'npm')).toHaveLength(1);
  });

  it('produces preconditions the existing prober can consume unchanged', () => {
    // One prober, not two. A second implementation of "does this binary exist" would be the
    // thirteenth instance of E-1 on this project.
    for (const p of extractPreconditions(REAL_PROMPT + ' npm')) {
      expect(['binary', 'file', 'dir', 'env', 'command']).toContain(p.kind);
      expect(p.why.length, 'a precondition with no reason is not actionable').toBeGreaterThan(10);
    }
  });
});

describe('acceptance is written before the work, and never invented', () => {
  it('derives a check when the prompt names a runnable command', () => {
    const reqs = extractRequirements(COMMAND_PROMPT);
    const acc = proposeAcceptance(reqs, COMMAND_PROMPT);
    const withRun = acc.filter((a) => a.run);
    expect(withRun.length, 'the prompt named commands and none became a check').toBeGreaterThan(0);
    expect(withRun.map((a) => a.run)).toContain('npm test');
  });

  it('leaves a check PENDING rather than inventing one it cannot derive', () => {
    // The load-bearing asymmetry. An invented criterion passes and teaches nothing; a pending
    // one is a hole somebody must fill before close can go green. Guessing here would rebuild,
    // inside the tool, the exact failure the tool exists to stop.
    const reqs = extractRequirements('Make it work and clean everything up.');
    const acc = proposeAcceptance(reqs, 'Make it work and clean everything up.');
    expect(acc.length, 'no acceptance rows at all').toBeGreaterThan(0);
    expect(acc.every((a) => a.run === null), 'a criterion was invented for a vague prompt').toBe(true);
    expect(acc[0].why).toMatch(/write one/);
  });

  it('does not adopt a command from an unrelated sentence as proof', () => {
    const prompt = 'Run `npm test` first.\nAlso rewrite the homepage copy.';
    const reqs = extractRequirements(prompt);
    const acc = proposeAcceptance(reqs, prompt);
    const copy = reqs.find((r) => /homepage copy/.test(r.text))!;
    const row = acc.find((a) => a.for === copy.id)!;
    expect(row.run, 'an unrelated command was adopted as proof of the copy rewrite').toBeNull();
  });

  it('never proposes acceptance for a question', () => {
    const reqs = extractRequirements(COMMAND_PROMPT);
    const q = reqs.find((r) => r.kind === 'question')!;
    expect(proposeAcceptance(reqs, COMMAND_PROMPT).find((a) => a.for === q.id)).toBeUndefined();
  });
});

describe('the brief as a whole', () => {
  const brief = buildBrief({ prompt: COMMAND_PROMPT, createdAt: '2026-08-18T00:00:00Z', rules: 'CLAUDE.md' });

  it('is content-addressed on the prompt, so the same ask is the same brief', () => {
    const again = buildBrief({ prompt: COMMAND_PROMPT, createdAt: '2026-08-19T00:00:00Z', rules: null });
    expect(again.id, 'the id moved when only the clock changed').toBe(brief.id);
  });

  it('takes its timestamp as an argument rather than reading the clock', () => {
    // Pure code that reads the clock cannot be tested twice with the same result, and this
    // project has already been bitten by a harness whose own setup changed the answer.
    expect(brief.createdAt).toBe('2026-08-18T00:00:00Z');
  });

  it('carries every requirement, and an acceptance row for each non-question', () => {
    const actions = brief.requirements.filter((r) => r.kind !== 'question');
    expect(brief.acceptance).toHaveLength(actions.length);
    for (const a of brief.acceptance) {
      expect(brief.requirements.some((r) => r.id === a.for), `${a.id} points at no requirement`).toBe(true);
    }
  });

  it('normalises for ids without destroying the text a person reads', () => {
    expect(normalise('  Run  `npm test`.  ')).toBe('run `npm test`');
    expect(brief.requirements.every((r) => r.text.trim() === r.text)).toBe(true);
  });
});
