import type { CapabilityEvent, ParsedSession, ToolCall } from './parse';

export const FINDINGS_VERSION = 'sessionfindings@1.0.0';

export type EvidenceClass = 'OBSERVED' | 'DERIVED';

export interface SessionFinding {
  code:
    | 'mcp_never_connected'
    | 'mcp_needs_auth'
    | 'tool_removed'
    | 'skill_never_offered'
    | 'skill_offered_never_used'
    | 'skill_listing_shrank'
    | 'compaction'
    | 'sidechain'
    | 'predicate_violated'
    | 'predicate_satisfied';
  severity: 'info' | 'warn' | 'error' | 'ok';
  title: string;
  detail: string;
  /** OBSERVED = read straight out of the file. DERIVED = computed from observed facts. */
  evidence: EvidenceClass;
  /** Record indices in the transcript that back this finding. */
  anchors: number[];
  items: string[];
}

/**
 * User-authored assertions. The user writes the predicate; we execute it over the
 * tool-call records. Nothing is inferred from natural language, so a VIOLATED verdict
 * here is a fact, not an opinion.
 */
export type Predicate =
  | { kind: 'forbid_tool'; tool: string; label?: string }
  | { kind: 'require_tool'; tool: string; label?: string }
  | { kind: 'forbid_bash'; pattern: string; label?: string }
  | { kind: 'require_read_before_edit'; file: string; label?: string }
  | { kind: 'require_skill'; skill: string; label?: string };

function bashCommands(calls: ToolCall[]): { call: ToolCall; command: string }[] {
  return calls
    .filter((c) => c.name === 'Bash' && typeof c.input.command === 'string')
    .map((c) => ({ call: c, command: c.input.command as string }));
}

function fileArgs(call: ToolCall): string[] {
  const out: string[] = [];
  for (const k of ['file_path', 'path', 'notebook_path', 'filePath']) {
    const v = call.input[k];
    if (typeof v === 'string') out.push(v);
  }
  return out;
}

export function runPredicates(session: ParsedSession, predicates: Predicate[]): SessionFinding[] {
  const findings: SessionFinding[] = [];
  const calls = session.toolCalls;

  for (const p of predicates) {
    const label = p.label ?? describePredicate(p);

    if (p.kind === 'forbid_tool' || p.kind === 'require_tool') {
      const hits = calls.filter((c) => c.name === p.tool);
      const bad = p.kind === 'forbid_tool' ? hits.length > 0 : hits.length === 0;
      findings.push({
        code: bad ? 'predicate_violated' : 'predicate_satisfied',
        severity: bad ? 'error' : 'ok',
        title: label,
        detail:
          p.kind === 'forbid_tool'
            ? hits.length
              ? `${p.tool} was called ${hits.length}×, at record${hits.length > 1 ? 's' : ''} ${hits.slice(0, 5).map((h) => h.index).join(', ')}.`
              : `${p.tool} was never called.`
            : hits.length
              ? `${p.tool} was called ${hits.length}×.`
              : `${p.tool} was never called in this session.`,
        evidence: 'OBSERVED',
        anchors: hits.slice(0, 10).map((h) => h.index),
        items: [],
      });
      continue;
    }

    if (p.kind === 'forbid_bash') {
      let re: RegExp;
      try {
        re = new RegExp(p.pattern, 'i');
      } catch {
        findings.push({
          code: 'predicate_violated',
          severity: 'warn',
          title: label,
          detail: `The pattern /${p.pattern}/ is not a valid regular expression, so this assertion was skipped.`,
          evidence: 'DERIVED',
          anchors: [],
          items: [],
        });
        continue;
      }
      const hits = bashCommands(calls).filter((b) => re.test(b.command));
      findings.push({
        code: hits.length ? 'predicate_violated' : 'predicate_satisfied',
        severity: hits.length ? 'error' : 'ok',
        title: label,
        detail: hits.length
          ? `Matched ${hits.length} shell command${hits.length > 1 ? 's' : ''}. First: ${JSON.stringify(hits[0].command.slice(0, 140))}`
          : `No shell command matched /${p.pattern}/ across ${bashCommands(calls).length} commands.`,
        evidence: 'OBSERVED',
        anchors: hits.slice(0, 10).map((h) => h.call.index),
        items: hits.slice(0, 5).map((h) => h.command.slice(0, 200)),
      });
      continue;
    }

    if (p.kind === 'require_read_before_edit') {
      const needle = p.file.toLowerCase();
      const firstRead = calls.find(
        (c) => (c.name === 'Read' || c.name === 'NotebookRead') && fileArgs(c).some((f) => f.toLowerCase().includes(needle))
      );
      const firstEdit = calls.find((c) => c.name === 'Edit' || c.name === 'Write' || c.name === 'NotebookEdit');
      const ok = Boolean(firstEdit && firstRead && firstRead.index < firstEdit.index) || !firstEdit;
      findings.push({
        code: ok ? 'predicate_satisfied' : 'predicate_violated',
        severity: ok ? 'ok' : 'error',
        title: label,
        detail: !firstEdit
          ? 'Nothing was edited in this session, so the rule never applied.'
          : firstRead
            ? ok
              ? `${p.file} was read at record ${firstRead.index}, before the first edit at record ${firstEdit.index}.`
              : `${p.file} was read at record ${firstRead.index}, but the first edit already happened at record ${firstEdit.index}.`
            : `${p.file} was never read, yet an edit happened at record ${firstEdit.index}.`,
        evidence: 'OBSERVED',
        anchors: [firstRead?.index, firstEdit?.index].filter((n): n is number => typeof n === 'number'),
        items: [],
      });
      continue;
    }

    if (p.kind === 'require_skill') {
      const hits = calls.filter(
        (c) => c.name === 'Skill' && String(c.input.skill ?? c.input.name ?? '').toLowerCase() === p.skill.toLowerCase()
      );
      findings.push({
        code: hits.length ? 'predicate_satisfied' : 'predicate_violated',
        severity: hits.length ? 'ok' : 'error',
        title: label,
        detail: hits.length
          ? `Skill "${p.skill}" was invoked ${hits.length}×.`
          : `Skill "${p.skill}" was never invoked in this session.`,
        evidence: 'OBSERVED',
        anchors: hits.slice(0, 10).map((h) => h.index),
        items: [],
      });
    }
  }

  return findings;
}

export function describePredicate(p: Predicate): string {
  switch (p.kind) {
    case 'forbid_tool':
      return `Never call ${p.tool}`;
    case 'require_tool':
      return `Must call ${p.tool} at least once`;
    case 'forbid_bash':
      return `Never run a shell command matching /${p.pattern}/`;
    case 'require_read_before_edit':
      return `Read ${p.file} before editing anything`;
    case 'require_skill':
      return `Invoke the ${p.skill} skill`;
  }
}

/** The capability findings — what the model could and could not see. */
export function analyseCapabilities(session: ParsedSession): SessionFinding[] {
  const findings: SessionFinding[] = [];
  const cap = session.capability;

  // 1. MCP servers that were announced as connecting and never resolved.
  const everPending = new Set<string>();
  const lastPending = new Set<string>();
  const lastNeedsAuth = new Set<string>();
  let lastToolEvent: CapabilityEvent | null = null;
  for (const e of cap) {
    if (e.kind !== 'tool') continue;
    e.pending.forEach((s) => everPending.add(s));
    lastToolEvent = e;
  }
  if (lastToolEvent) {
    lastToolEvent.pending.forEach((s) => lastPending.add(s));
    lastToolEvent.needsAuth.forEach((s) => lastNeedsAuth.add(s));
  }

  if (lastPending.size > 0) {
    findings.push({
      code: 'mcp_never_connected',
      severity: 'error',
      title: `${lastPending.size} MCP server${lastPending.size > 1 ? 's' : ''} never finished connecting`,
      detail:
        'These servers were still listed as connecting at the last capability update in the session. Their tools were never available, and nothing in the conversation would have told you.',
      evidence: 'OBSERVED',
      anchors: lastToolEvent ? [lastToolEvent.index] : [],
      items: [...lastPending],
    });
  }

  if (lastNeedsAuth.size > 0) {
    findings.push({
      code: 'mcp_needs_auth',
      severity: 'error',
      title: `${lastNeedsAuth.size} MCP server${lastNeedsAuth.size > 1 ? 's' : ''} needed authentication`,
      detail: 'These servers were present but unusable without an auth step, so their tools were effectively missing.',
      evidence: 'OBSERVED',
      anchors: lastToolEvent ? [lastToolEvent.index] : [],
      items: [...lastNeedsAuth],
    });
  }

  const resolved = [...everPending].filter((s) => !lastPending.has(s));
  if (resolved.length) {
    findings.push({
      code: 'mcp_never_connected',
      severity: 'info',
      title: `${resolved.length} MCP server${resolved.length > 1 ? 's' : ''} connected late`,
      detail:
        'These servers were still connecting when the session began, so their tools were unavailable for the earliest turns. They resolved later.',
      evidence: 'OBSERVED',
      anchors: cap.filter((e) => e.kind === 'tool').map((e) => e.index).slice(0, 4),
      items: resolved,
    });
  }

  // 2. Tools that were withdrawn and not put back.
  const removed = new Map<string, number>();
  for (const e of cap) {
    e.removed.forEach((t) => removed.set(t, e.index));
    e.added.concat(e.readded).forEach((t) => removed.delete(t));
  }
  if (removed.size) {
    findings.push({
      code: 'tool_removed',
      severity: 'warn',
      title: `${removed.size} tool${removed.size > 1 ? 's' : ''} disappeared mid-session`,
      detail: 'These tools were available and were later withdrawn without being restored.',
      evidence: 'OBSERVED',
      anchors: [...new Set(removed.values())],
      items: [...removed.keys()],
    });
  }

  // 3. Skills: what was offered, and what was actually used.
  const listings = cap.filter((e) => e.kind === 'skill' && e.fullSet);
  const offered = new Set<string>();
  listings.forEach((l) => l.fullSet!.forEach((s) => offered.add(s)));

  if (listings.length >= 2) {
    for (let i = 1; i < listings.length; i++) {
      const before = new Set(listings[i - 1].fullSet!);
      const after = new Set(listings[i].fullSet!);
      const lost = [...before].filter((s) => !after.has(s));
      if (lost.length) {
        findings.push({
          code: 'skill_listing_shrank',
          severity: 'error',
          title: `${lost.length} skill${lost.length > 1 ? 's' : ''} stopped being offered to the model`,
          detail: `The skill listing changed at record ${listings[i].index}. These skills were visible before and were not in the new listing, so the model could no longer choose them.`,
          evidence: 'OBSERVED',
          anchors: [listings[i - 1].index, listings[i].index],
          items: lost,
        });
      }
    }
  }

  const usedSkills = new Set(
    session.toolCalls
      .filter((c) => c.name === 'Skill')
      .map((c) => String(c.input.skill ?? c.input.name ?? '').toLowerCase())
      .filter(Boolean)
  );
  const neverUsed = [...offered].filter((s) => !usedSkills.has(s.toLowerCase()));
  if (offered.size > 0) {
    findings.push({
      code: 'skill_offered_never_used',
      severity: neverUsed.length === offered.size ? 'warn' : 'info',
      title: `${neverUsed.length} of ${offered.size} available skills were never invoked`,
      detail:
        'Availability is not use. A skill that is listed every turn and never chosen is either badly described for its trigger, or not needed. This is the cheapest signal you have about which of your skills are dead weight.',
      evidence: 'DERIVED',
      anchors: listings.map((l) => l.index),
      items: neverUsed,
    });
  }

  // 4. Compaction and sub-agent boundaries — stated with their documented consequences.
  for (const c of session.compactions) {
    findings.push({
      code: 'compaction',
      severity: 'warn',
      title: `Context compaction at record ${c.index}`,
      detail:
        'Per Anthropic’s documentation, the system prompt, project-root CLAUDE.md, auto memory and MCP tools reload after compaction. Three things do not: the skill description listing (only skills already invoked survive), rules with paths: frontmatter, and nested CLAUDE.md files — the last two stay gone until a matching file is read again. Invoked skill bodies come back truncated at 5,000 tokens each and 25,000 total.',
      evidence: 'OBSERVED',
      anchors: [c.index],
      items: [],
    });
  }

  if (session.sidechainCount > 0) {
    findings.push({
      code: 'sidechain',
      severity: 'info',
      title: `${session.sidechainCount} records ran inside sub-agents`,
      detail:
        'Sub-agents get their own context. They load CLAUDE.md and the same skills and MCP servers, but not your conversation history and not the main session’s auto memory. The built-in Explore and Plan agents skip CLAUDE.md entirely.',
      evidence: 'OBSERVED',
      anchors: [],
      items: [],
    });
  }

  return findings;
}
