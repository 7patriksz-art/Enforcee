import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRuleset } from '@/lib/rules/parse';
import { buildReinjectText, compilePolicy, hookSettings, proposeDenyRules } from '@/lib/enforce/policy';

const GUARD = join(process.cwd(), 'guard', 'guard.mjs');

let project: string;

const RULESET = `# Ops rules
- Never run \`supabase db push\` against production.
- Never use emojis.
- Always cite sources with links.
`;

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), 'enforcio-guard-'));
  mkdirSync(join(project, '.enforcio'), { recursive: true });

  const { rules } = parseRuleset(RULESET);
  const proposals = proposeDenyRules(rules);
  const strip = ({ id, rule, tool, pattern, flags, reason }: (typeof proposals)[number]) => ({ id, rule, tool, pattern, flags, reason });
  const on = proposals.filter((p) => p.defaultOn || /supabase/.test(p.pattern));
  const chosen = on.filter((p) => p.severity === 'deny').map(strip);
  const warn = on.filter((p) => p.severity === 'warn').map(strip);

  const policy = compilePolicy(RULESET, rules, chosen, warn);
  writeFileSync(join(project, '.enforcio', 'policy.json'), JSON.stringify(policy, null, 2));
});

afterAll(() => {
  if (project) rmSync(project, { recursive: true, force: true });
});

/** Run the guard exactly as Claude Code would: JSON on stdin, read stdout and the exit code. */
function runGuard(payload: object, cwd = project): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [GUARD], {
      input: JSON.stringify({ cwd, ...payload }),
      encoding: 'utf8',
      cwd,
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function decision(stdout: string) {
  if (!stdout.trim()) return null;
  return JSON.parse(stdout) as {
    hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string };
    systemMessage?: string;
  };
}

describe('guard: active enforcement', () => {
  it('denies a recursive delete aimed at a filesystem root', () => {
    const r = runGuard({
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf / --no-preserve-root' },
    });
    expect(r.code).toBe(0);
    const d = decision(r.stdout)!;
    expect(d.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(d.hookSpecificOutput?.permissionDecisionReason).toMatch(/Blocked by Enforcio rule/);
  });

  it('warns rather than blocks on an ordinary recursive delete', () => {
    const r = runGuard({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf ./build' },
    });
    const d = decision(r.stdout)!;
    expect(d.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(d.hookSpecificOutput?.additionalContext).toMatch(/Enforcio warning/);
  });

  it('denies a force push but allows --force-with-lease', () => {
    const bad = decision(runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }).stdout)!;
    expect(bad.hookSpecificOutput?.permissionDecision).toBe('deny');
    const ok = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push --force-with-lease origin main' } });
    expect(ok.stdout.trim()).toBe('');
  });

  it('denies a rule the user wrote themselves', () => {
    const r = runGuard({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npx supabase db push --linked' },
    });
    const d = decision(r.stdout)!;
    expect(d.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(d.hookSpecificOutput?.permissionDecisionReason).toMatch(/supabase db push/i);
  });

  it('blocks reading a .env file', () => {
    const r = runGuard({
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/srv/app/.env.production' },
    });
    expect(decision(r.stdout)!.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('lets an ordinary command through with no decision', () => {
    const r = runGuard({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
  });

  it('does not fire a Bash rule on a different tool', () => {
    const r = runGuard({
      hook_event_name: 'PreToolUse',
      tool_name: 'WebFetch',
      tool_input: { url: 'https://example.com/rm -rf /' },
    });
    expect(r.stdout.trim()).toBe('');
  });
});

describe('guard: repair after compaction', () => {
  it('re-injects the ruleset as additionalContext', () => {
    const r = runGuard({ hook_event_name: 'PostCompact', session_id: 's1' });
    const d = decision(r.stdout)!;
    const ctx = d.hookSpecificOutput?.additionalContext ?? '';
    expect(ctx).toMatch(/ENFORCIO/);
    expect(ctx).toMatch(/Never use emojis/);
    expect(ctx.length).toBeLessThanOrEqual(9500);
    expect(d.systemMessage).toMatch(/re-injected/i);
  });

  it('primes a resumed session the same way', () => {
    const d = decision(runGuard({ hook_event_name: 'SessionStart' }).stdout)!;
    expect(d.hookSpecificOutput?.additionalContext).toMatch(/Never use emojis/);
  });

  it('caps the payload at the documented 10,000 character hook limit', () => {
    const many = Array.from({ length: 900 }, (_, i) => `- Never do forbidden thing number ${i} under any circumstances at all.`).join('\n');
    const { rules } = parseRuleset(many);
    const text = buildReinjectText(rules);
    expect(text.length).toBeLessThanOrEqual(9500);
    expect(text).toMatch(/truncated/);
  });
});

describe('guard: safety of the guard itself', () => {
  it('never blocks when there is no policy at all', () => {
    const empty = mkdtempSync(join(tmpdir(), 'enforcio-nopolicy-'));
    const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, empty);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('');
    rmSync(empty, { recursive: true, force: true });
  });

  it('degrades to a visible warning when the policy is corrupt, never to a block', () => {
    const broken = mkdtempSync(join(tmpdir(), 'enforcio-broken-'));
    mkdirSync(join(broken, '.enforcio'), { recursive: true });
    writeFileSync(join(broken, '.enforcio', 'policy.json'), '{ not json');
    const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, broken);
    expect(r.code).toBe(0);
    expect(decision(r.stdout)!.systemMessage).toMatch(/no rules are being enforced/i);
    rmSync(broken, { recursive: true, force: true });
  });

  it('survives a malformed hook payload', () => {
    let code = 0;
    try {
      execFileSync('node', [GUARD], { input: 'not json at all', encoding: 'utf8', cwd: project });
    } catch (e) {
      code = (e as { status?: number }).status ?? -1;
    }
    expect(code).toBe(0);
  });

  it('survives a deny rule with an invalid regex', () => {
    const bad = mkdtempSync(join(tmpdir(), 'enforcio-badre-'));
    mkdirSync(join(bad, '.enforcio'), { recursive: true });
    writeFileSync(
      join(bad, '.enforcio', 'policy.json'),
      JSON.stringify({ version: 1, deny: [{ id: 'x', rule: 'r', tool: 'Bash', pattern: '([' }], warn: [], reinject: { text: '' } })
    );
    const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'anything' } }, bad);
    expect(r.code).toBe(0);
    rmSync(bad, { recursive: true, force: true });
  });

  it('finds the policy from a nested working directory', () => {
    const nested = join(project, 'src', 'deep', 'deeper');
    mkdirSync(nested, { recursive: true });
    const r = runGuard({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }, nested);
    expect(decision(r.stdout)!.hookSpecificOutput?.permissionDecision).toBe('deny');
  });
});

describe('guard: the ledger', () => {
  it('records every decision it makes', () => {
    runGuard({ hook_event_name: 'PreToolUse', session_id: 'led', tool_name: 'Bash', tool_input: { command: 'npm publish' } });
    runGuard({ hook_event_name: 'PreToolUse', session_id: 'led', tool_name: 'Bash', tool_input: { command: 'ls' } });
    const p = join(project, '.enforcio', 'ledger.jsonl');
    expect(existsSync(p)).toBe(true);
    const lines = readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.some((l) => l.decision === 'DENY')).toBe(true);
    expect(lines.some((l) => l.decision === 'ALLOW')).toBe(true);
    for (const l of lines) expect(l.guard).toMatch(/^guard@/);
  });
});

describe('policy compilation', () => {
  const { rules } = parseRuleset(RULESET);

  it('proposes the user’s own explicit rules and the standing library', () => {
    const p = proposeDenyRules(rules);
    expect(p.some((x) => x.basis.includes('your ruleset'))).toBe(true);
    expect(p.some((x) => x.basis.includes('standing library'))).toBe(true);
  });

  it('leaves ambiguous proposals off by default', () => {
    const p = proposeDenyRules(rules);
    expect(p.some((x) => !x.defaultOn)).toBe(true);
    // Nothing derived from vague prose is ever enabled without a click.
    for (const x of p.filter((y) => y.defaultOn)) {
      expect(x.pattern.length).toBeGreaterThan(3);
    }
  });

  it('emits hook wiring for every event the product depends on', () => {
    const s = hookSettings();
    expect(Object.keys(s.hooks).sort()).toEqual(['PostCompact', 'PreToolUse', 'SessionStart', 'Stop']);
    expect(s.hooks.PreToolUse[0].hooks[0].command).toMatch(/guard\.mjs$/);
  });

  it('stamps the ruleset hash so a stale policy is detectable', () => {
    const a = compilePolicy(RULESET, rules, []);
    const b = compilePolicy(RULESET + '\n- One more rule.\n', rules, []);
    expect(a.rulesetHash).not.toBe(b.rulesetHash);
  });
});
