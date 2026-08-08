import type { Rule } from '../types';
import { hashText } from '../receipt';

export const POLICY_VERSION = 'policy@1.0.0';

/**
 * A deny rule is the only thing in Enforcio that can stop an action, so it is held
 * to a higher standard than a verdict: it is always derived from an explicit pattern
 * and always confirmed by the user before it is compiled in. We never infer a block
 * from prose and switch it on silently.
 */
export interface DenyRule {
  id: string;
  /** The human rule this came from, verbatim. */
  rule: string;
  /** Tool name, a |-separated list, or '*'. */
  tool: string;
  pattern: string;
  flags?: string;
  reason?: string;
}

export interface Policy {
  version: 1;
  generatedAt: string;
  rulesetHash: string;
  engine: string;
  deny: DenyRule[];
  warn: DenyRule[];
  reinject: { text: string };
}

export interface Proposal extends DenyRule {
  /** Why Enforcio thinks this is enforceable, shown next to the checkbox. */
  basis: string;
  /** Enabled by default only when the pattern is unambiguous. */
  defaultOn: boolean;
  severity: 'deny' | 'warn';
}

/**
 * The standing library of destructive operations.
 *
 * `on` decides what is enabled before the user touches anything. The bar for `on` is
 * high: the operation must have essentially no legitimate use inside an agent loop, or
 * be irreversible outside the working copy. Everything else is proposed and left off,
 * because a guard that blocks ordinary work gets uninstalled within a day.
 *
 * Note the deliberate split on `rm -rf`: deleting a build directory is normal, deleting
 * a home directory or a filesystem root is not. Same command, different severity.
 */
const DANGEROUS: { re: string; tool: string; label: string; on: boolean; severity: 'deny' | 'warn' }[] = [
  {
    re: 'rm\\s+(-[a-zA-Z]*\\s+)*-?[a-zA-Z]*[rf][a-zA-Z]*\\s+(/|~|\\$HOME|\\.\\.)(\\s|$|/)',
    tool: 'Bash',
    label: 'recursive delete of a filesystem root, home directory or parent directory',
    on: true,
    severity: 'deny',
  },
  { re: 'rm\\s+-[a-z]*r[a-z]*f|rm\\s+-[a-z]*f[a-z]*r', tool: 'Bash', label: 'recursive force delete', on: true, severity: 'warn' },
  { re: 'git\\s+push\\s+.*(--force(?!-with-lease)|\\s-f\\b)', tool: 'Bash', label: 'force push', on: true, severity: 'deny' },
  { re: 'git\\s+reset\\s+--hard', tool: 'Bash', label: 'hard reset, which discards uncommitted work', on: true, severity: 'warn' },
  { re: 'git\\s+clean\\s+-[a-z]*f', tool: 'Bash', label: 'force clean', on: true, severity: 'warn' },
  { re: '\\b(drop|truncate)\\s+(table|database|schema)\\b', tool: 'Bash', label: 'destructive SQL', on: true, severity: 'deny' },
  {
    re: '(supabase|prisma|drizzle-kit)\\s+.*\\b(db\\s+push|migrate\\s+deploy|push)\\b',
    tool: 'Bash',
    label: 'migration against a live database',
    on: true,
    severity: 'deny',
  },
  { re: '\\b(npm|yarn|pnpm)\\s+publish\\b', tool: 'Bash', label: 'package publish', on: true, severity: 'deny' },
  { re: '\\b(vercel|netlify|fly|railway)\\s+deploy\\b|\\bvercel\\s+--prod\\b', tool: 'Bash', label: 'production deploy', on: true, severity: 'deny' },
  { re: '\\b(curl|wget)\\b[^|]*\\|\\s*(sudo\\s+)?(ba|z)?sh', tool: 'Bash', label: 'pipe-to-shell install', on: true, severity: 'deny' },
  { re: '\\bchmod\\s+(-R\\s+)?777\\b', tool: 'Bash', label: 'world-writable permissions', on: true, severity: 'warn' },
  { re: '\\bgit\\s+commit\\b', tool: 'Bash', label: 'commit', on: false, severity: 'warn' },
  { re: '\\bgit\\s+push\\b', tool: 'Bash', label: 'push', on: false, severity: 'warn' },
  { re: '\\b(npm|yarn|pnpm)\\s+install\\s+-g\\b|\\bnpm\\s+i\\s+-g\\b', tool: 'Bash', label: 'global package install', on: false, severity: 'warn' },
];

const SECRET_PATHS = '(^|/)\\.env(\\.|$)|(^|/)id_rsa$|\\.pem$|(^|/)\\.aws/|(^|/)\\.ssh/|credentials\\.json$';

function pid(text: string): string {
  return 'D-' + hashText(text).slice(0, 8);
}

/**
 * Turn a ruleset into candidate deny rules.
 *
 * Two sources, and the UI distinguishes them:
 *  - rules the user wrote that already contain an explicit, machine-checkable pattern
 *  - a standing library of destructive operations, offered whether or not the ruleset
 *    mentions them, because most people forget to write these down until after the incident
 */
export function proposeDenyRules(rules: Rule[]): Proposal[] {
  const out: Proposal[] = [];
  const seen = new Set<string>();

  const push = (p: Proposal) => {
    const key = `${p.tool}::${p.pattern}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  // 1. From the user's own rules, where they were specific enough to enforce.
  for (const rule of rules) {
    const c = rule.check;

    if (c.kind === 'forbidden_regex') {
      push({
        id: pid(rule.text + c.pattern),
        rule: rule.text,
        tool: '*',
        pattern: c.pattern,
        flags: c.flags?.replace('g', '') || 'i',
        reason: 'You wrote this pattern yourself.',
        basis: 'explicit regex in your ruleset',
        defaultOn: true,
        severity: 'deny',
      });
      continue;
    }

    if (c.kind === 'forbidden_literal') {
      for (const needle of c.needles) {
        // Only worth enforcing at the tool boundary if it looks like a command or a path.
        const looksOperational = /[\s/\\.-]/.test(needle) && needle.length >= 3;
        if (!looksOperational) continue;
        push({
          id: pid(rule.text + needle),
          rule: rule.text,
          tool: 'Bash',
          pattern: needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
          flags: 'i',
          reason: 'Your ruleset forbids this literally.',
          basis: `quoted literal "${needle}" in your ruleset`,
          defaultOn: false,
          severity: 'deny',
        });
      }
    }
  }

  // 2. The standing library.
  for (const d of DANGEROUS) {
    push({
      id: pid(d.re),
      rule: d.severity === 'deny' ? `Never run a ${d.label}.` : `Warn before running a ${d.label}.`,
      tool: d.tool,
      pattern: d.re,
      flags: 'i',
      reason: `${d.label} is irreversible or reaches outside this working copy.`,
      basis: 'Enforcio standing library of destructive operations',
      defaultOn: d.on,
      severity: d.severity,
    });
  }

  push({
    id: pid('secret-paths'),
    rule: 'Never read or write secrets and key material.',
    tool: 'Read|Write|Edit',
    pattern: SECRET_PATHS,
    flags: 'i',
    reason: 'Keys and .env files should not pass through a model context.',
    basis: 'Enforcio standing library of sensitive paths',
    defaultOn: true,
    severity: 'deny',
  });

  return out;
}

/**
 * The re-injection payload.
 *
 * Anthropic documents exactly three things that do not come back after compaction:
 * the skill description listing, rules with `paths:` frontmatter, and nested CLAUDE.md
 * files. Everything else reloads on its own. So we re-inject the rules themselves in a
 * compact form and say plainly why we are doing it.
 */
export function buildReinjectText(rules: Rule[], label = 'your ruleset'): string {
  const lines = rules.map((r, i) => `${String(i + 1).padStart(2, '0')}. [${r.id}] ${r.text}`);
  const body = lines.join('\n');
  const header =
    `ENFORCIO — rules re-injected after a context boundary.\n` +
    `These are the ${rules.length} rules from ${label}. Anthropic's documentation states that the skill ` +
    `description listing, rules with paths: frontmatter, and nested CLAUDE.md files do not survive ` +
    `compaction. Treat the list below as in force for the rest of this session.\n\n`;
  const text = header + body;
  return text.length > 9500 ? text.slice(0, 9400) + '\n… (truncated to fit the 10,000 character hook limit)' : text;
}

export function compilePolicy(
  rulesetText: string,
  rules: Rule[],
  chosen: DenyRule[],
  warn: DenyRule[] = []
): Policy {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    rulesetHash: hashText(rulesetText),
    engine: POLICY_VERSION,
    deny: chosen,
    warn,
    reinject: { text: buildReinjectText(rules) },
  };
}

/** The settings.json fragment that wires the guard into a project. */
export function hookSettings(guardPath = '.enforcio/guard.mjs') {
  const cmd = `node ${guardPath}`;
  return {
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: cmd, timeout: 10 }] }],
      PostCompact: [{ matcher: 'manual|auto', hooks: [{ type: 'command', command: cmd, timeout: 10 }] }],
      SessionStart: [{ matcher: 'startup|resume|compact|fork', hooks: [{ type: 'command', command: cmd, timeout: 10 }] }],
      Stop: [{ matcher: '*', hooks: [{ type: 'command', command: cmd, timeout: 10 }] }],
    },
  };
}
