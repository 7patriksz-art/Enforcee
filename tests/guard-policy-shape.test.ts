import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueLicence } from '../src/lib/licence';
import { fileURLToPath } from 'node:url';
import { harvest } from './helpers/spawn';

/**
 * Two shapes of hand-written policy.json that the guard used to mishandle.
 *
 * `enforcee guard <rules-file>` always writes the right shape, so these only arise when a
 * policy is written by hand — which the runner explicitly supports and which the licence
 * gate in `main()` exists because of. Both were found by feeding the real runner hostile
 * input as a subprocess, and both are recorded here as behaviour rather than as a comment.
 *
 * The property is the one D-007.2 states: a policy the guard cannot use degrades to a
 * VISIBLE warning. Not a block, and — the part that was missing — not silence.
 */

const REAL_GUARD = fileURLToPath(new URL('../guard/guard.mjs', import.meta.url));
let GUARD = REAL_GUARD;
let LICENCE = '';

beforeAll(() => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const dir = mkdtempSync(join(tmpdir(), 'shape-guard-'));
  GUARD = join(dir, 'guard-under-test.mjs');
  const real = readFileSync(REAL_GUARD, 'utf8');
  const patched = real.replace(/-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\n/, pubPem);
  expect(patched).not.toBe(real);
  writeFileSync(GUARD, patched);
  LICENCE = issueLicence(
    { jti: 'shape', sub: 'tests@enforcee', plan: 'founder', exp: Math.floor(Date.now() / 1000) + 3600 },
    privPem
  );
});

const RULE = { id: 'R1', rule: 'Never rm -rf the filesystem root', pattern: 'rm\\s+-rf\\s+/', reason: 'r' };

function project(policyText: string) {
  const dir = mkdtempSync(join(tmpdir(), 'shape-proj-'));
  mkdirSync(join(dir, '.enforcee'), { recursive: true });
  writeFileSync(join(dir, '.enforcee/licence'), LICENCE);
  writeFileSync(join(dir, '.enforcee/policy.json'), policyText);
  return dir;
}

function run(dir: string, command = 'rm -rf /') {
  let stdout = '';
  let crashed = false;
  try {
    stdout = execFileSync(process.execPath, [GUARD], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command },
        session_id: 's',
        cwd: dir,
      }),
      cwd: dir,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, ENFORCEE_LICENCE: LICENCE },
    });
  } catch (e) {
    crashed = true;
    stdout = harvest(e).output;
  }
  let json: Record<string, never> | null = null;
  const last = stdout.trim().split('\n').pop() ?? '';
  try {
    json = last ? JSON.parse(last) : null;
  } catch {
    json = null;
  }
  const ledgerPath = join(dir, '.enforcee/ledger.jsonl');
  const ledger = existsSync(ledgerPath)
    ? readFileSync(ledgerPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l).decision as string)
    : [];
  const o = json as unknown as {
    systemMessage?: string;
    hookSpecificOutput?: { permissionDecision?: string };
  } | null;
  return {
    crashed,
    ledger,
    message: o?.systemMessage ?? null,
    decision: o?.hookSpecificOutput?.permissionDecision ?? null,
  };
}

describe('the guard can still enforce at all', () => {
  it('CONTROL: a well-shaped policy denies, so every "allowed" below means something', () => {
    const r = run(project(JSON.stringify({ version: 1, deny: [RULE] })));
    expect(r.decision).toBe('deny');
    expect(r.ledger).toEqual(['DENY']);
  });
});

describe('one unusable entry is a dropped rule, not a dropped policy', () => {
  it('the other rules in the policy still enforce', () => {
    const r = run(project(JSON.stringify({ version: 1, deny: [null, RULE] })));
    expect(r.crashed).toBe(false);
    expect(r.decision).toBe('deny');
  });

  it('a junk entry in warn does not disable every deny rule', () => {
    const r = run(project(JSON.stringify({ version: 1, deny: [RULE], warn: [null] })));
    expect(r.decision).toBe('deny');
  });

  it('says how many rules DID run, rather than implying the rest were enforced', () => {
    const r = run(project(JSON.stringify({ version: 1, deny: [null, RULE] })));
    expect(r.message).toMatch(/NOT enforced/i);
    // The old message said "1 entry was NOT enforced", implying the others were. None were.
    expect(r.message).toMatch(/remaining 1 were|remaining \d+ were/i);
  });
});

describe('policy.json whose top level is an array', () => {
  it('warns out loud instead of silently enforcing nothing', () => {
    const r = run(project(JSON.stringify([RULE])));
    expect(r.crashed).toBe(false);
    expect(r.decision).not.toBe('deny');
    expect(r.message).toMatch(/not a policy/i);
  });

  it('does NOT write an ALLOW row, because nothing was checked', () => {
    // The ledger is the evidence surface. An ALLOW here reads as "the guard looked at this
    // and permitted it", for a call no rule was ever run against.
    expect(run(project(JSON.stringify([RULE]))).ledger).not.toContain('ALLOW');
    expect(run(project('[]')).ledger).not.toContain('ALLOW');
  });
});

describe('a rule whose fields are not the type the runner reads them as', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['tool is an array', { ...RULE, id: 'BAD', tool: ['Bash', 'Write'] }],
    ['tool is a number', { ...RULE, id: 'BAD', tool: 123 }],
    ['tool is an object', { ...RULE, id: 'BAD', tool: {} }],
    ['flags is a number', { ...RULE, id: 'BAD', flags: 5 }],
  ];

  for (const [name, bad] of cases) {
    it(`${name}: the other rules in the policy still enforce`, () => {
      const r = run(project(JSON.stringify({ version: 1, deny: [bad, { ...RULE, id: 'GOOD' }] })));
      expect(r.crashed).toBe(false);
      // The whole policy used to die here with "internal error", so nothing was blocked.
      expect(r.decision).toBe('deny');
    });
  }

  it('names the dropped rule rather than reporting an internal error', () => {
    const r = run(project(JSON.stringify({ version: 1, deny: [{ ...RULE, id: 'BAD', tool: ['Bash'] }] })));
    expect(r.message).toMatch(/NOT enforced/i);
    expect(r.message).not.toMatch(/internal error/i);
  });
});
