import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Policy } from './policy';
import { hookSettings } from './policy';

let cachedGuard: string | null = null;

export function guardSource(): string {
  if (cachedGuard) return cachedGuard;
  cachedGuard = readFileSync(join(process.cwd(), 'guard', 'guard.mjs'), 'utf8');
  return cachedGuard;
}

function heredoc(path: string, content: string, marker: string): string {
  return `mkdir -p "$(dirname "${path}")"\ncat > "${path}" <<'${marker}'\n${content}\n${marker}\n`;
}

/**
 * A single readable shell script that writes the three files a project needs.
 *
 * Deliberately not a curl-pipe-to-shell one-liner: this product blocks that pattern by
 * default, and shipping an installer that does the thing we tell people never to do
 * would be the fastest possible way to lose the audience. Download it, read it, run it.
 */
export function installScript(policy: Policy, opts: { merge?: boolean } = {}): string {
  const settings = hookSettings();
  const denyCount = policy.deny.length;
  const warnCount = policy.warn.length;

  const header = `#!/usr/bin/env bash
# Enforcio guard installer
# Generated ${policy.generatedAt}
# Ruleset hash ${policy.rulesetHash.slice(0, 16)}
#
# Writes three files into the current project:
#   .enforcio/policy.json   ${denyCount} blocking rule(s), ${warnCount} warning rule(s)
#   .enforcio/guard.mjs     the runner — no dependencies, plain Node
#   .claude/settings.json   the hook wiring
#
# Read it before you run it. Every line is visible below.
set -euo pipefail

if [ ! -d .git ] && [ ! -f package.json ]; then
  echo "This does not look like a project root. cd there first." >&2
  exit 1
fi

`;

  const files =
    heredoc('.enforcio/policy.json', JSON.stringify(policy, null, 2), 'ENFORCIO_POLICY') +
    '\n' +
    heredoc('.enforcio/guard.mjs', guardSource(), 'ENFORCIO_GUARD') +
    '\nchmod +x .enforcio/guard.mjs\n\n';

  // Heredoc terminators must sit at column 0, so nothing below gets indented even
  // where it would read more nicely — bash does not care about how it reads.
  const writeSettings = heredoc('.claude/settings.json', JSON.stringify(settings, null, 2), 'ENFORCIO_SETTINGS');

  const settingsBlock = opts.merge
    ? `# Merge the hooks into an existing .claude/settings.json rather than clobbering it.
if [ -f .claude/settings.json ]; then
node -e 'const fs=require("fs");
const existing=JSON.parse(fs.readFileSync(".claude/settings.json","utf8"));
const add=${JSON.stringify(JSON.stringify(settings))};
const parsed=JSON.parse(add);
existing.hooks=existing.hooks||{};
for (const [event,entries] of Object.entries(parsed.hooks)) {
  existing.hooks[event]=(existing.hooks[event]||[]).filter(e=>!JSON.stringify(e).includes("enforcio")).concat(entries);
}
fs.writeFileSync(".claude/settings.json", JSON.stringify(existing,null,2)+"\\n");
console.log("merged Enforcio hooks into your existing .claude/settings.json");'
else
${writeSettings}fi
`
    : writeSettings;

  const footer = `
echo ""
echo "Enforcio guard installed."
echo "  ${denyCount} rule(s) will block a tool call before it runs."
echo "  ${warnCount} rule(s) will warn without blocking."
echo "  Your rules are re-injected automatically after every context compaction."
echo ""
echo "Decisions are appended to .enforcio/ledger.jsonl."
echo "Add .enforcio/ledger.jsonl to .gitignore if you do not want it committed."
echo ""
echo "Test it without risk:"
echo "  echo '{\\"hook_event_name\\":\\"PreToolUse\\",\\"tool_name\\":\\"Bash\\",\\"tool_input\\":{\\"command\\":\\"git push --force\\"}}' | node .enforcio/guard.mjs"
echo ""
echo "Restart Claude Code for the hooks to take effect."
`;

  return header + files + settingsBlock + footer;
}
