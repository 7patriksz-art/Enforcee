import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusFrom, readSaid, saidId, trimSaid, worthCapturing } from '@/lib/prevent/said';
import { extractPreferences } from '@/lib/preferences';
import { hookSettings } from '@/lib/enforce/policy';

/**
 * HEARING IT WHEN IT IS SAID — the first step of the loop, and the one that was missing.
 *
 * Patrik, 2026-08-18: *"a tool that studies where it had previously made mistakes, creates
 * guards based on the user preference when he says something you should or shouldn't."*
 *
 * Enforcement and verification were both live in the hook. Learning was not: `enforcee learn`
 * only ran when a human typed it against a file they had to go and find. So the moment that
 * matters most — somebody saying "never do that again" mid-session — was recorded nowhere and
 * was gone by the next session. That is the exact failure this product exists to fix.
 */

const GUARD = fileURLToPath(new URL('../guard/guard.mjs', import.meta.url));
const CLI = fileURLToPath(new URL('../cli/dist/enforcee.mjs', import.meta.url));

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'said-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(join(dir, '.enforcee', 'policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
  return dir;
}

function say(dir: string, prompt: string, session = 's1') {
  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt }),
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ENFORCEE_LICENCE: '' },
  });
  const read = (f: string) => {
    try {
      return readFileSync(join(dir, '.enforcee', f), 'utf8');
    } catch {
      return '';
    }
  };
  return { code: r.status, said: readSaid(read('said.jsonl')), ledger: read('ledger.jsonl') };
}

/**
 * THE RELATIONSHIP THAT MATTERS, and the reason the guard is allowed a crude gate.
 *
 * The guard captures; the library decides. Demanding the two agree word for word would be
 * asking two things doing different jobs to be the same job. What must hold is one-directional
 * and much stronger for it: ANYTHING THE LIBRARY WOULD EXTRACT MUST HAVE BEEN CAPTURED.
 *
 * Over-capture costs a line in a JSONL file. Under-capture loses the sentence forever, and
 * there is no later pass that can recover a turn nobody wrote down.
 */
describe('the guard captures a superset of what the library can use', () => {
  const REAL_THINGS_PEOPLE_SAY = [
    'never force push to main, it breaks everyone else',
    "don't add comments to the generated files",
    'always run the tests before you commit anything',
    'stop using em-dashes in the copy',
    'from now on put new components under src/ui',
    'you should prefer const over let in this codebase',
    'make sure every new endpoint has an auth check',
    'avoid pulling in new dependencies for small things',
  ];

  for (const text of REAL_THINGS_PEOPLE_SAY) {
    it(`captures: "${text.slice(0, 44)}..."`, () => {
      expect(worthCapturing(text), 'the guard would have thrown this turn away').toBe(true);
    });
  }

  it('captures every turn the library is able to make a rule out of', () => {
    // The superset property, checked rather than asserted. If extractPreferences finds a
    // candidate in a sentence, the capture gate must not have been the thing that dropped it.
    const missed = REAL_THINGS_PEOPLE_SAY.filter(
      (t) => extractPreferences(t).length > 0 && !worthCapturing(t)
    );
    expect(missed, `the library can use these but the guard never kept them: ${missed.join(' | ')}`).toEqual([]);
  });

  it('is not so eager that the store fills with noise', () => {
    // Each of these came from a real turn shape, not from imagination. An approval is not a
    // preference, a question is not an instruction, and a pasted log is not somebody talking.
    expect(worthCapturing('yes'), 'an approval was captured as a preference').toBe(false);
    expect(worthCapturing('ok do it'), 'an approval was captured as a preference').toBe(false);
    expect(worthCapturing('what does this function do?'), 'a question was captured as an instruction').toBe(false);
    expect(worthCapturing('can you look at the auth module'), 'a task with no instruction was captured').toBe(false);
    expect(
      worthCapturing('ERROR: never mind the details\n' + 'x'.repeat(3000)),
      'a pasted log containing the word "never" was captured as a preference'
    ).toBe(false);
  });
});

describe('the same instruction is one instruction', () => {
  it('gives the same id however it was punctuated or capitalised', () => {
    expect(saidId('Never force push!')).toBe(saidId('never force push'));
    expect(saidId('never   force  push')).toBe(saidId('never force push'));
  });

  it('gives different ids to different instructions', () => {
    expect(saidId('never force push')).not.toBe(saidId('never delete a branch'));
  });

  it('deduplicates the corpus, because emphasis is not evidence', () => {
    // Saying it three times in one session is one preference. Repetition that counts is
    // repetition the mention counter in learned.json records, keyed on the occurrence — a
    // distinction this project already paid for when `learn notes.md` run twice reported
    // "heard 2x" for something said once.
    const rows = readSaid(
      [
        JSON.stringify({ id: saidId('never force push'), at: 'x', session: 's', text: 'never force push' }),
        JSON.stringify({ id: saidId('Never force push.'), at: 'y', session: 's', text: 'Never force push.' }),
        JSON.stringify({ id: saidId('always run tests'), at: 'z', session: 's', text: 'always run tests' }),
      ].join('\n')
    );
    const corpus = corpusFrom(rows);
    expect(corpus.match(/force push/g), 'the same instruction was counted twice').toHaveLength(1);
    expect(corpus).toContain('always run tests');
  });

  it('survives a truncated append rather than losing the file', () => {
    const rows = readSaid('{"id":"S-1","text":"never force push"}\n{"id":"S-2","tex');
    expect(rows).toHaveLength(1);
  });

  it('forgets the oldest first, so the store cannot grow without bound', () => {
    // It lives in somebody's repository and is appended to on a keystroke path. A preference
    // said once eight months ago and never repeated is the one worth forgetting; anything
    // that still matters gets said again.
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `S-${i}`, at: '', session: null, text: `t${i}` }));
    const kept = trimSaid(many, 500);
    expect(kept).toHaveLength(500);
    expect(kept[kept.length - 1].id, 'it dropped the newest instead of the oldest').toBe('S-599');
  });
});

describe('the hook writes it down the moment it is typed', () => {
  it('records an instruction and never blocks the turn', () => {
    const dir = project();
    const got = say(dir, 'never force push to main, it breaks everyone else');
    expect(got.code, 'the guard blocked somebody mid-sentence').toBe(0);
    expect(got.said).toHaveLength(1);
    expect(got.said[0].text, 'the quote was paraphrased — the words ARE the evidence').toBe(
      'never force push to main, it breaks everyone else'
    );
    expect(got.said[0].session).toBe('s1');
    expect(got.ledger, 'nothing was recorded in the ledger, so a run cannot be audited').toContain('"SAID"');
  });

  it('ignores a turn that is not an instruction', () => {
    const dir = project();
    expect(say(dir, 'what does the audit command do?').said).toHaveLength(0);
  });

  it('does not write the same instruction twice in a row', () => {
    const dir = project();
    say(dir, 'always run the tests before you commit');
    say(dir, 'always run the tests before you commit');
    expect(say(dir, 'always run the tests before you commit').said, 'emphasis was recorded as evidence').toHaveLength(1);
  });

  it('does record it again once something else was said in between', () => {
    // Across turns is real repetition. This is the signal that separates a passing remark
    // from a preference somebody actually holds.
    const dir = project();
    say(dir, 'always run the tests before you commit');
    say(dir, 'never add comments to generated files');
    const got = say(dir, 'always run the tests before you commit');
    expect(got.said).toHaveLength(3);
  });

  it('keeps working when there is no policy at all', () => {
    // Capture is free and unlicensed by design: hearing what somebody says is not the paid
    // half, and a project that has not installed enforcement yet is exactly where the first
    // instruction gets said.
    const dir = mkdtempSync(join(tmpdir(), 'said-bare-'));
    const r = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: dir, prompt: 'never force push' }),
      cwd: dir,
      encoding: 'utf8',
    });
    expect(r.status, 'a project with no policy had its turn broken').toBe(0);
  });

  it('is registered by the install, or nothing is ever captured', () => {
    const s = hookSettings() as { hooks?: Record<string, unknown> };
    expect(
      Object.keys(s.hooks ?? {}),
      'UserPromptSubmit is not wired, so the learning half never runs'
    ).toContain('UserPromptSubmit');
  });
});

describe('`enforcee learn` with no file reads what this project heard', () => {
  function learn(dir: string) {
    const r = spawnSync(process.execPath, [CLI, 'learn', '--json'], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: r.stdout ?? '', err: (r.stderr ?? '').replace(/\x1b\[[0-9;]*m/g, '') };
  }

  it('turns what was captured into proposed rules', () => {
    const dir = project();
    say(dir, 'never force push to main, it breaks everyone else');
    say(dir, 'always run the tests before you commit anything');
    const r = learn(dir);
    expect(r.code).toBe(0);
    const found = JSON.parse(r.out) as { rule?: string }[];
    expect(found.length, 'nothing was proposed from two clear instructions').toBeGreaterThan(0);
    expect(JSON.stringify(found)).toMatch(/force push|tests/i);
  });

  it('refuses rather than reporting nothing when nothing was captured', () => {
    // "No preferences found" and "no corpus was read" look identical in a terminal, and only
    // one of them is a result. Six recorded instances on this project of a scan that silently
    // covered nothing.
    const r = learn(project());
    expect(r.code, 'an empty corpus was reported as a clean answer').toBe(2);
    expect(r.err).toMatch(/Nothing has been captured/);
    expect(r.err, 'it did not say how to fix it').toMatch(/enforcee guard|enforcee learn <file>/);
  });
});
