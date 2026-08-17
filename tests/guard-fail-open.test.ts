import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compilePolicy, proposeDenyRules, toDenyRule } from '../src/lib/enforce/policy';
import { parseRuleset } from '../src/lib/rules/parse';
import { issueLicence } from '../src/lib/licence';
import { fileURLToPath } from 'node:url';
import { harvest } from './helpers/spawn';

/**
 * FAIL-OPEN is the worst outcome this file can produce.
 *
 * Claude Code treats a hook that times out, crashes or exits non-zero as a NON-BLOCKING
 * error — the tool call proceeds. So a guard that is slow, or throws, or cannot find its
 * policy, is not a degraded guard: it is an absent one, and it is absent SILENTLY, which
 * is indistinguishable from a session where nothing dangerous was ever attempted.
 *
 * Every case here was executed against the real runner and observed to allow.
 */

const REAL_GUARD = fileURLToPath(new URL('../guard/guard.mjs', import.meta.url));
let GUARD = REAL_GUARD;
let LICENCE = '';

beforeAll(() => {
  // The real runner with a test key swapped in, so these exercise the shipped code path
  // rather than a copy of it — same technique as tests/guard.test.ts.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = mkdtempSync(join(tmpdir(), 'failopen-guard-'));
  GUARD = join(dir, 'guard-under-test.mjs');
  const real = readFileSync(REAL_GUARD, 'utf8');
  const patched = real.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\n/, pubPem);
  expect(patched).not.toBe(real);
  writeFileSync(GUARD, patched);
  LICENCE = issueLicence(
    { jti: 'failopen', sub: 'tests@enforcee', plan: 'founder', exp: Math.floor(Date.now() / 1000) + 3600 },
    privPem
  );
});

function project(ruleset = '- Never force-push to a shared branch.') {
  const dir = mkdtempSync(join(tmpdir(), 'failopen-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(join(dir, '.enforcee/licence'), LICENCE);
  const { rules } = parseRuleset(ruleset);
  const proposals = proposeDenyRules(rules).filter((p) => p.defaultOn);
  const policy = compilePolicy(
    ruleset,
    rules,
    proposals.filter((p) => p.severity === 'deny').map(toDenyRule),
    proposals.filter((p) => p.severity === 'warn').map(toDenyRule)
  );
  writeFileSync(join(dir, '.enforcee/policy.json'), JSON.stringify(policy));
  return dir;
}

function run(dir: string, command: string, tool = 'Bash', input?: Record<string, unknown>, timeout = 12_000) {
  const started = Date.now();
  let stdout = '';
  let crashed = false;
  try {
    stdout = execFileSync(process.execPath, [GUARD], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: tool,
        tool_input: input ?? { command },
        session_id: 's',
        cwd: dir,
      }),
      cwd: dir, encoding: 'utf8', timeout, env: { ...process.env, ENFORCEE_LICENCE: LICENCE },
    });
  } catch (e) {
    crashed = true;
    stdout = harvest(e).output;
  }
  let decision: string | undefined;
  try {
    decision = JSON.parse(stdout.trim() || '{}')?.hookSpecificOutput?.permissionDecision;
  } catch {
    /* not JSON */
  }
  return { stdout, decision, crashed, ms: Date.now() - started };
}

describe('a user regex cannot stall the guard into silence', () => {
  const REDOS = '- Never write an API key assignment matching /\\w+\\s*\\w+\\s*\\w+\\s*\\w+\\s*=\\s*sk-/ into a file.';

  it('refuses a polynomial pattern instead of running it', () => {
    // Written in good faith to catch an API key assignment. Five unbounded quantifiers over
    // overlapping classes: 117ms at 60 chars, 3.5s at 120, past 180s at 200. The hook
    // times out at 10s, and a timed-out hook is non-blocking — so this one rule skipped
    // every deny rule after it, including `rm -rf /`.
    const r = run(project(REDOS), 'x'.repeat(200) + ' ; rm -rf / --no-preserve-root');
    expect(r.crashed, 'the guard timed out — that is a fail-open').toBe(false);
    expect(r.ms).toBeLessThan(6000);
    expect(r.decision).toBe('deny');
  });

  it('and says which rule it did not check', () => {
    const dir = project(REDOS);
    const r = run(dir, 'echo hello');
    expect(r.stdout).toMatch(/could not check/i);
    const rows = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(rows.some((x) => x.decision === 'UNCHECKED')).toBe(true);
  });
});

describe('the guard cannot be switched off in one allowed call', () => {
  for (const cmd of [
    'cd .enforcee && rm licence',
    'cd .enforcee && rm policy.json',
    "cd .enforcee; echo '{}' > policy.json",
    "sed -i 's/deny/xxx/g' .enforcee/policy.json",
    'cp /dev/null .enforcee/policy.json',
    'python3 -c "import os; os.remove(\'.enforcee/policy.json\')"',
    'rm .enforcee/policy.json',
    "echo '{}' > .enforcee/policy.json",
    'mv .enforcee/policy.json /tmp/',
  ]) {
    it(`denies: ${cmd}`, () => {
      expect(run(project(), cmd).decision).toBe('deny');
    });
  }

  it('still lets a person read their own ledger', () => {
    expect(run(project(), 'cat .enforcee/ledger.jsonl').decision).toBeUndefined();
  });
});

describe('a rule cannot be disarmed by text belonging to another command', () => {
  it('a trailing comment does not satisfy the safe-flag lookahead', () => {
    expect(run(project(), 'git push --force origin main # --force-with-lease').decision).toBe('deny');
  });

  it('nor does a later command that merely mentions it', () => {
    expect(run(project(), 'git push --force origin main; echo --force-with-lease').decision).toBe('deny');
  });

  it('but the safe form itself is still allowed', () => {
    expect(run(project(), 'git push --force-with-lease origin main').decision).toBeUndefined();
  });
});

describe('flag padding does not get past a delete rule', () => {
  for (const cmd of [
    'rm -r -f -v -d -f -r -f /',
    'rm -f -f -f -f -f -f -rf /etc',
    'rm -r -f -v -d -f -r -f ~',
    'rm --recursive --force --verbose --dir --one-file-system --no-preserve-root --interactive /',
  ]) {
    it(`denies: ${cmd}`, () => {
      expect(run(project(), cmd).decision).toBe('deny');
    });
  }
});

describe('a policy that is valid JSON but not a policy', () => {
  for (const [name, body] of [
    ['null', 'null'],
    ['deny as an object', '{"deny":{"a":1}}'],
    ['deny as a number', '{"deny":7}'],
    ['a null rule', '{"deny":[null]}'],
    ['a null warn rule', '{"warn":[null]}'],
    ['a bare string', '"nope"'],
  ] as const) {
    it(`does not crash on ${name}`, () => {
      const dir = mkdtempSync(join(tmpdir(), 'shape-'));
      mkdirSync(join(dir, '.enforcee'), { recursive: true });
      writeFileSync(join(dir, '.enforcee/licence'), LICENCE);
      writeFileSync(join(dir, '.enforcee/policy.json'), body);
      const r = run(dir, 'rm -rf /');
      expect(r.crashed, 'the guard threw — an uncaught throw is a silent fail-open').toBe(false);
      // It cannot enforce, but it must never do so silently.
      expect(r.stdout.trim().length, 'nothing was printed at all').toBeGreaterThan(0);
      expect(r.stdout).toMatch(/not a policy|could not be read|not enforced/i);
    });
  }
});

describe('a rule applies to every tool it claims to', () => {
  it('a user pattern reaches Write and Edit content, not just the path', () => {
    const dir = project('- Never write an AWS key matching /AKIA[0-9A-Z]{16}/ anywhere.');
    expect(run(dir, '', 'Bash', { command: 'echo AKIAIOSFODNN7EXAMPLE' }).decision).toBe('deny');
    expect(run(dir, '', 'Write', { file_path: 'creds.txt', content: 'AKIAIOSFODNN7EXAMPLE' }).decision).toBe('deny');
    expect(run(dir, '', 'Edit', { file_path: 'a.ts', new_string: 'const k = "AKIAIOSFODNN7EXAMPLE"' }).decision).toBe('deny');
  });
});

describe('depth does not make the guard vanish', () => {
  it('finds the policy from a deeply nested directory', () => {
    const dir = project();
    const deep = join(dir, ...Array.from({ length: 20 }, (_, i) => `d${i}`));
    mkdirSync(deep, { recursive: true });
    expect(run(deep, 'rm -rf / --no-preserve-root').decision).toBe('deny');
  });
});

describe('the ledger can reconstruct what happened', () => {
  it('records the subject of an allowed call, not just the fact of it', () => {
    const dir = project();
    run(dir, 'echo something-distinctive');
    const rows = readFileSync(join(dir, '.enforcee/ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(rows.find((x) => x.decision === 'ALLOW')?.subject).toContain('something-distinctive');
  });
});

describe('secret paths through the shell', () => {
  for (const cmd of [
    'cat /srv/app/.env',
    'dd if=.env of=/tmp/x',
    'python3 -c "print(open(\'.env\').read())"',
    'while read l; do echo $l; done < .env',
    'cat /' + 'a'.repeat(140) + '/.env',
    'node -e "console.log(require(\'fs\').readFileSync(\'.env\',\'utf8\'))"',
  ]) {
    it(`denies: ${cmd.slice(0, 50)}`, () => {
      expect(run(project(), cmd).decision).toBe('deny');
    });
  }

  it('does not block ordinary work', () => {
    expect(run(project(), 'cat package.json').decision).toBeUndefined();
    expect(run(project(), 'npm test').decision).toBeUndefined();
  });
});

describe('the escalation counter is constant work', () => {
  it('does not read a huge ledger to count 60 rows', () => {
    const dir = project();
    run(dir, 'echo warmup');
    const noise = 'x'.repeat(1024);
    const rows: string[] = [];
    for (let i = 0; i < 60_000; i++) rows.push(JSON.stringify({ decision: 'NOISE', pad: noise }));
    writeFileSync(join(dir, '.enforcee/ledger.jsonl'), rows.join('\n') + '\n');
    const r = run(dir, 'rm -rf / --no-preserve-root');
    expect(r.decision).toBe('deny');
    expect(r.ms, 'a slow guard is an absent guard').toBeLessThan(5000);
  });
});

describe('every standing-library rule is marked as ours', () => {
  it('so the shape check never disarms our own protections', () => {
    // Two guard self-protection rules were missing `trusted`, so a stricter shape check
    // silently switched off the rules that stop the guard being deleted.
    const { rules } = parseRuleset('- Never do anything dangerous.');
    const standing = proposeDenyRules(rules).filter((p) => p.basis.startsWith('Enforcee standing library'));
    expect(standing.length).toBeGreaterThan(5);
    const untrusted = standing.filter((p) => p.trusted !== true).map((p) => p.id);
    expect(untrusted, `standing-library rules not marked trusted: ${untrusted.join(', ')}`).toEqual([]);
  });
});
