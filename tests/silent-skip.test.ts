import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHealth } from '../src/lib/checks/health';
import { parseRuleset } from '../src/lib/rules/parse';
import { inferPreconditions, clauses } from '../src/lib/prevent/infer';
import { checkPrecondition } from '../src/lib/prevent/preconditions';
import { checkClaim } from '../src/lib/prevent/claims';

/**
 * A skipped check reads exactly like a passed one. That is the failure this product is
 * built to name, so finding it in our own code is the finding that matters most.
 */

describe('an empty result is not a clean result', () => {
  it('says so when nothing could be parsed', () => {
    // A real file that yields nothing: a title and a paragraph with no directive in it.
    const text = 'Our engineering standards\n\nThis document describes how our team thinks about quality.\n';
    const { rules } = parseRuleset(text);
    const findings = runHealth(rules, text, 20);
    const f = findings.find((x) => x.code === 'no_rules');
    expect(f, 'a ruleset that yielded 0 rules produced no finding').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.message).toMatch(/nothing was checked/i);
  });

  it('and distinguishes an empty file from an unparseable one', () => {
    const empty = runHealth([], '', 0).find((x) => x.code === 'no_rules');
    expect(empty!.message).toMatch(/empty/i);
    expect(empty!.message).toMatch(/not a pass/i);
  });

  it('stays quiet when rules were found', () => {
    const text = '- Never use emoji.\n- Always cite sources with links.\n';
    const { rules } = parseRuleset(text);
    expect(runHealth(rules, text, 20).some((x) => x.code === 'no_rules')).toBe(false);
  });
});

describe('polarity and illustration are per clause, not per rule', () => {
  it('one hypothetical word does not silence a whole rule', () => {
    const { rules } = parseRuleset('- Always run `dig` to check a domain, not something like `whois`.');
    const got = inferPreconditions(rules);
    expect(got.map((p) => p.target)).toContain('dig');
    expect(got.map((p) => p.target)).not.toContain('whois');
  });

  it('a prohibition still stops the demand it would create', () => {
    const { rules } = parseRuleset('- Never log or commit `DATABASE_URL`.');
    expect(inferPreconditions(rules)).toEqual([]);
  });

  it('negation carries across a list', () => {
    const { rules } = parseRuleset('- Never run `curl`, `wget`, or `nc` from a build step.');
    expect(inferPreconditions(rules)).toEqual([]);
  });

  it('clauses carry their own flags and reset at a sentence break', () => {
    const cs = clauses('Never use `foo`. Always run `bar`.');
    expect(cs[0].negative).toBe(true);
    expect(cs[cs.length - 1].negative).toBe(false);
  });
});

describe('no shell is built out of an inferred name', () => {
  it('refuses a binary name that is not a binary name', () => {
    const canary = join(tmpdir(), `enforcee-injection-${process.pid}`);
    const r = checkPrecondition({ kind: 'binary', target: `sh; touch ${canary}`, why: 'test' });
    expect(r.met).toBe(false);
    expect(existsSync(canary), 'a shell ran').toBe(false);
  });

  it('refuses command substitution', () => {
    const canary = join(tmpdir(), `enforcee-injection2-${process.pid}`);
    const r = checkPrecondition({ kind: 'binary', target: `$(touch ${canary})`, why: 'test' });
    expect(r.met).toBe(false);
    expect(existsSync(canary), 'a shell ran').toBe(false);
  });

  it('still finds a real binary', () => {
    expect(checkPrecondition({ kind: 'binary', target: 'node', why: 'test' }).met).toBe(true);
    expect(checkPrecondition({ kind: 'binary', target: 'definitely-not-installed-xyz', why: 'test' }).met).toBe(false);
  });
});

describe('model prose cannot steer a filesystem probe', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'claims-'));

  it('will not stat a path outside the session directory', () => {
    const r = checkClaim({ kind: 'file-created', subject: '../../../etc/passwd', quote: 'I created `../../../etc/passwd`.' }, { cwd });
    expect(r.verdict).toBe('UNCHECKABLE');
    expect(r.reason).toMatch(/outside the project/i);
    // And it must not leak whether the file is there.
    expect(r.evidence).not.toMatch(/exists|ENOENT/);
  });

  it('nor an absolute one', () => {
    const r = checkClaim({ kind: 'file-created', subject: '/etc/hosts', quote: 'I created `/etc/hosts`.' }, { cwd });
    expect(r.verdict).toBe('UNCHECKABLE');
  });

  it('still checks a real claim about a real file', () => {
    writeFileSync(join(cwd, 'made.ts'), 'x');
    expect(checkClaim({ kind: 'file-created', subject: 'made.ts', quote: 'I created `made.ts`.' }, { cwd }).verdict).toBe('CONFIRMED');
    expect(checkClaim({ kind: 'file-created', subject: 'absent.ts', quote: 'I created `absent.ts`.' }, { cwd }).verdict).toBe('REFUTED');
  });
});

describe('the loaded-instructions ledger does not overcount at scale', () => {
  function fire(dir: string, session: string) {
    execFileSync(process.execPath, [new URL('../guard/guard.mjs', import.meta.url).pathname], {
      input: JSON.stringify({
        hook_event_name: 'InstructionsLoaded',
        session_id: session,
        cwd: dir,
        file_path: join(dir, 'CLAUDE.md'),
        load_reason: 'compact',
      }),
      cwd: dir, encoding: 'utf8', env: { ...process.env, ENFORCEE_LICENCE: '' },
    });
  }

  it('dedupes even when thousands of other rows have been written since', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loaded-'));
    mkdirSync(join(dir, '.enforcee'), { recursive: true });
    writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));

    fire(dir, 's1');
    // A busy session. The old implementation only looked at the last 400 rows, so the
    // first record scrolled out of the window and the same fact was recorded again.
    const noise = Array.from({ length: 900 }, (_, i) => JSON.stringify({ decision: 'NOISE', i })).join('\n');
    writeFileSync(join(dir, '.enforcee/ledger.jsonl'), readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8') + noise + '\n');
    fire(dir, 's1');
    fire(dir, 's1');

    const loaded = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.decision === 'LOADED');
    expect(loaded.length).toBe(1);
  });

  it('but a genuinely new session is recorded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loaded2-'));
    mkdirSync(join(dir, '.enforcee'), { recursive: true });
    writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify({ deny: [], warn: [], reinject: { text: '' } }));
    fire(dir, 's1');
    fire(dir, 's2');
    const loaded = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.decision === 'LOADED');
    expect(loaded.length).toBe(2);
  });
});
