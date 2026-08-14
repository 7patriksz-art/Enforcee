import type { Rule } from '../types';
import { hashText } from '../receipt';

export const POLICY_VERSION = 'policy@1.0.0';

/**
 * A deny rule is the only thing in Enforcee that can stop an action, so it is held
 * to a higher standard than a verdict: it is always derived from an explicit pattern
 * and always confirmed by the user before it is compiled in. We never infer a block
 * from prose and switch it on silently.
 */
export interface DenyRule {
  id: string;
  /**
   * True only for Enforcee's standing library. Those patterns were hardened by measurement
   * during the August security audit and are exempt from the guard's shape check, which a
   * conservative checker would otherwise reject — disarming the guard's own protections.
   * A pattern derived from a user's ruleset is never trusted.
   */
  trusted?: boolean;
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

/**
 * The single definition of what a proposal contributes to a compiled policy.
 *
 * This existed as three separate inline `strip` functions — in the CLI, in the enforce API
 * route, and in the guard test — and adding one field to DenyRule updated one of them. The
 * result: policies written by the CLI carried `trusted`, policies written by the test did
 * not, and nine guard protections silently stopped matching. Tenth instance of one idea in
 * several places on this project, so it is a function now.
 */
export function toDenyRule(p: Proposal): DenyRule {
  return {
    id: p.id,
    rule: p.rule,
    tool: p.tool,
    pattern: p.pattern,
    flags: p.flags,
    reason: p.reason,
    ...(p.trusted ? { trusted: true } : {}),
  };
}

export interface Proposal extends DenyRule {
  /** Why Enforcee thinks this is enforceable, shown next to the checkbox. */
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
    // Linear by construction. The previous form used -?[a-zA-Z]*[rf][a-zA-Z]*, which
    // backtracks catastrophically: 120,000 characters of flags took 15.7s, exceeding the
    // 10s hook timeout — and a timed-out hook is treated as a NON-BLOCKING error, so every
    // deny rule after it was skipped. A slow guard is an absent guard.
    re: 'rm\\s+(?:-{1,2}[a-zA-Z-]{1,20}\\s+){0,20}["\'‘’]?(?:/|~|\\$HOME|\\.\\.)(?:\\*|["\'‘’]?\\s|["\'‘’]?$|/)',
    tool: 'Bash',
    label: 'recursive delete of a filesystem root, home directory or parent directory',
    on: true,
    severity: 'deny',
  },
  {
    re: 'rm\\s+(?:-{1,2}[a-zA-Z-]{1,20}\\s+){0,20}["\'‘’]?/(?:etc|usr|bin|sbin|lib|var|boot|dev|proc|sys|System|Library|Applications|Users|home)\\b',
    tool: 'Bash',
    label: 'recursive delete of a system directory',
    on: true,
    severity: 'deny',
  },
  { re: 'rm\\s+-[a-z]*r[a-z]*f|rm\\s+-[a-z]*f[a-z]*r', tool: 'Bash', label: 'recursive force delete', on: true, severity: 'warn' },
  {
    // `git push -f` — the form almost everyone actually types — walked straight through
    // the previous pattern, while /install claimed "force-push denied". Also covers
    // clustered short flags (-uf), long forms, refspec forcing (+main), and -c prefixes.
    re: 'git\\s+(?:\\S+\\s+)*?push\\b(?!.*--force-with-lease).*?(?:--force\\b|\\s-[a-zA-Z]*f[a-zA-Z]*\\b|\\s\\+[\\w./-]+)',
    tool: 'Bash',
    label: 'force push',
    on: true,
    severity: 'deny',
  },
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
  {
    // Previously [^|]*, which could not cross an intermediate pipe: `curl x | tee f | sh`
    // and `curl x > f && sh f` both walked through. Now covers redirect-then-run too.
    re: '\\b(?:curl|wget)\\b[\\s\\S]{0,200}?(?:\\|[\\s\\S]{0,80}?\\b(?:ba|z|k)?sh\\b|>\\s*\\S{1,80}[\\s\\S]{0,40}?(?:;|&&)\\s*(?:sudo\\s+)?(?:ba|z|k)?sh\\b)',
    tool: 'Bash',
    label: 'pipe-to-shell install',
    on: true,
    severity: 'deny',
  },
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
/** Backticked or quoted literals in a rule — the command an action rule is about. */
function literalsOf(text: string): string[] {
  const out: string[] = [];
  const re = /[`"'“‘]([^`"'”’]{1,60})[`"'”’]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = m[1].trim();
    if (v.length >= 1) out.push(v);
  }
  return out;
}

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

    // 'action' rules land here too, and that distinction is worth stating.
    //
    // An action rule — "never run `supabase db push` against production" — is UNVERIFIABLE
    // to the audit layer, because no reading of a text output can establish whether a command
    // ran. It is the single most enforceable thing the GUARD has, because the guard watches
    // the command itself. Same rule, unanswerable by one layer and exactly answerable by
    // another, which is the clearest argument for having both.
    //
    // Classifying action rules separately broke this until the literals were routed back in.
    const needles =
      c.kind === 'forbidden_literal'
        ? c.needles
        : c.kind === 'action' && /\b(never|not|don't|do not|avoid|no)\b/i.test(rule.text)
          ? literalsOf(rule.text)
          : [];

    if (needles.length) {
      for (const needle of needles) {
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
      basis: 'Enforcee standing library of destructive operations',
      trusted: true,
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
    basis: 'Enforcee standing library of sensitive paths',
    trusted: true,
    defaultOn: true,
    severity: 'deny',
  });

  // The same rule, for the shell. Scoping secrets to Read/Write/Edit left `cat .env` wide
  // open — and that is not an adversarial bypass, it is the ordinary next move for a model
  // that was just denied on Read. The bypass a first-time user finds by accident is worth
  // more attention than the one requiring deliberate evasion.
  push({
    id: pid('secret-paths-bash'),
    rule: 'Never read secrets and key material through the shell either.',
    tool: 'Bash',
    pattern:
      '\\b(cat|less|more|head|tail|bat|nl|od|xxd|strings|cp|mv|scp|rsync|base64|grep|rg|awk|sed|source|dd|tee|python3?|node|perl|ruby|php|openssl|gpg|curl|wget|zip|tar|read|export|env|printenv|\\.)\\b[^\\n]{0,400}?(\\.env(\\.|\\b)|id_rsa|id_ed25519|\\.pem\\b|\\.ssh/|\\.aws/|credentials\\.json)'
      + '|<\\s*[^\\n]{0,200}?(\\.env(\\.|\\b)|id_rsa|id_ed25519|\\.pem\\b|\\.ssh/|\\.aws/|credentials\\.json)',
    flags: 'i',
    reason: 'Denied on Read, so the shell is denied too. Print the value yourself if you truly need it.',
    basis: 'Enforcee standing library of sensitive paths',
    trusted: true,
    defaultOn: true,
    severity: 'deny',
  });

  // A guard that can be switched off by the thing it guards is decoration. This matters
  // most in exactly the situation the escalation ladder exists for: a model that has been
  // blocked twice and is looking for another way through. "Edit the config" is the obvious
  // next move, and nothing stopped it.
  push({
    id: pid('guard-self-protection'),
    rule: 'Never modify or delete the guard, its policy, or its ledger.',
    tool: 'Write|Edit',
    pattern: '(^|/)\\.enforcee/|(^|/)\\.claude/settings(\\.local)?\\.json$',
    flags: 'i',
    reason:
      'This is the policy you asked to be enforced. Changing it is a decision for the human, not a step in a task. Ask them.',
    basis: 'Enforcee standing library — guard integrity',
    trusted: true,
    defaultOn: true,
    severity: 'deny',
  });

  push({
    id: pid('guard-self-protection-bash'),
    rule: 'Never modify or delete the guard through the shell.',
    tool: 'Bash',
    pattern:
      // Two independent halves, because the first version demanded the path come AFTER the
      // verb and within 120 characters, and knew seven verbs. Every one of these disarmed the
      // guard in a single allowed call: `cd .enforcee && rm licence`, `cd .enforcee; echo {} >
      // policy.json`, `sed -i s/deny/x/ .enforcee/policy.json`, `cp /dev/null
      // .enforcee/policy.json`, `python3 -c "os.remove('.enforcee/policy.json')"`.
      //
      // So: naming .enforcee or .claude ANYWHERE in a command that also contains ANY writing
      // verb is denied, in either order — and the guard's own filenames are protected on
      // their own, since `cd` into the directory leaves no path in the command at all.
      // Reading is deliberately still allowed: `cat .enforcee/ledger.jsonl` is how a person
      // checks up on us.
      '(?:\\.(?:enforcee|claude)\\b[^\\n]{0,200}?\\b(?:rm|mv|cp|truncate|shred|unlink|tee|dd|sed|perl|python3?|node|ruby|chmod|chown|install|ln|mktemp)\\b' +
      '|\\b(?:rm|mv|cp|truncate|shred|unlink|tee|dd|sed|perl|python3?|node|ruby|chmod|chown|install|ln)\\b[^\\n]{0,200}?\\.(?:enforcee|claude)\\b' +
      '|>>?\\s*[^\\n]{0,120}?\\.(?:enforcee|claude)\\b' +
      '|\\.(?:enforcee|claude)\\b[^\\n]{0,200}?>>?' +
      '|\\b(?:rm|mv|truncate|shred|unlink)\\b[^\\n]{0,80}?\\b(?:policy\\.json|ledger\\.jsonl|licence|license)\\b)',
    flags: 'i',
    reason:
      'This is the policy you asked to be enforced. Changing it is a decision for the human, not a step in a task. Ask them.',
    basis: 'Enforcee standing library — guard integrity',
    trusted: true,
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
    `ENFORCEE — rules re-injected after a context boundary.\n` +
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
export function hookSettings(guardPath = '.enforcee/guard.mjs') {
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
