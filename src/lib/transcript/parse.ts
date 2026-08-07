/**
 * Claude Code session transcript reader.
 *
 * Runs entirely in the browser — a transcript is the single most sensitive file a
 * developer owns, and it never leaves the machine.
 *
 * Discipline, per the charter: we report only what the file OBSERVES. The session
 * file contains no system prompt and no CLAUDE.md content, so we never claim to know
 * what instructions were in the model's context. What it does contain, and what we
 * therefore can prove, is the capability surface: which skills were listed to the
 * model, which tools and MCP servers were available, when that set changed, and which
 * tool calls actually happened.
 */

export const TRANSCRIPT_VERSION = 'transcript@1.0.0';

export interface RawRecord {
  type?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  agentId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  message?: { role?: string; model?: string; content?: unknown; usage?: Record<string, number> };
  attachment?: Record<string, unknown>;
  toolUseResult?: unknown;
  [k: string]: unknown;
}

export interface ToolCall {
  index: number;
  uuid: string;
  name: string;
  input: Record<string, unknown>;
  timestamp: string | null;
  isSidechain: boolean;
  agentId: string | null;
}

export type CapabilityKind = 'skill' | 'tool' | 'mcp-server' | 'agent';

export interface CapabilityEvent {
  index: number;
  timestamp: string | null;
  kind: CapabilityKind;
  /** What the record literally reported. */
  added: string[];
  removed: string[];
  readded: string[];
  /** MCP servers still connecting at this point. */
  pending: string[];
  /** MCP servers that cannot be used until the user authenticates. */
  needsAuth: string[];
  /** For skill listings: the complete set visible at this moment. */
  fullSet: string[] | null;
  isInitial: boolean;
}

export interface ParsedSession {
  sessionId: string | null;
  cwd: string | null;
  version: string | null;
  gitBranch: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** Every record, in file order. */
  total: number;
  /** Records we could not classify — surfaced in the UI rather than swallowed. */
  unrecognized: { type: string; count: number }[];
  /** Records on the surviving branch of the parentUuid DAG, in order. */
  mainPath: RawRecord[];
  /** Records that were abandoned by an edit/rewind and never reached the model again. */
  abandoned: number;
  /** parentUuid values with more than one child — the rewind points. */
  forkPoints: string[];
  toolCalls: ToolCall[];
  capability: CapabilityEvent[];
  /** True if a compaction/summary boundary was found. */
  compactions: { index: number; timestamp: string | null }[];
  sidechainCount: number;
  models: string[];
  bytes: number;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function strList(v: unknown): string[] {
  return asArray(v).filter((x): x is string => typeof x === 'string');
}

/**
 * Walk the parentUuid DAG and keep only the branch that survives.
 *
 * Transcripts are trees, not timelines: pressing escape twice and retrying creates a
 * fork, and the abandoned branch stays in the file. Reading the file top to bottom
 * would silently mix work that was thrown away into "what actually happened".
 * We take the deepest chain ending at the last record that has no children.
 */
export function resolveMainPath(records: RawRecord[]): { path: RawRecord[]; abandoned: number; forks: string[] } {
  const byUuid = new Map<string, RawRecord>();
  const childCount = new Map<string, number>();

  for (const r of records) {
    if (typeof r.uuid === 'string') byUuid.set(r.uuid, r);
  }
  for (const r of records) {
    if (typeof r.parentUuid === 'string' && byUuid.has(r.parentUuid)) {
      childCount.set(r.parentUuid, (childCount.get(r.parentUuid) ?? 0) + 1);
    }
  }

  const forks = [...childCount.entries()].filter(([, n]) => n > 1).map(([u]) => u);

  // Leaves are records nobody claims as a parent. The last one in file order is the live tip.
  const leaves = records.filter((r) => typeof r.uuid === 'string' && !childCount.has(r.uuid));
  const tip = leaves.length ? leaves[leaves.length - 1] : records[records.length - 1];

  const chain: RawRecord[] = [];
  const seen = new Set<string>();
  let cursor: RawRecord | undefined = tip;
  while (cursor && typeof cursor.uuid === 'string' && !seen.has(cursor.uuid)) {
    seen.add(cursor.uuid);
    chain.push(cursor);
    cursor = typeof cursor.parentUuid === 'string' ? byUuid.get(cursor.parentUuid) : undefined;
  }
  chain.reverse();

  // Records with no uuid (attachments, queue operations, mode changes) are session-level
  // metadata rather than conversation nodes, so they belong on the path regardless.
  const onPath = new Set(chain.map((r) => r.uuid as string));
  const path = records.filter((r) => typeof r.uuid !== 'string' || onPath.has(r.uuid));
  const abandoned = records.filter((r) => typeof r.uuid === 'string' && !onPath.has(r.uuid)).length;

  return { path, abandoned, forks };
}

export function parseTranscript(text: string): ParsedSession {
  const records: RawRecord[] = [];
  const unrecognized = new Map<string, number>();

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      records.push(JSON.parse(t) as RawRecord);
    } catch {
      unrecognized.set('<unparseable line>', (unrecognized.get('<unparseable line>') ?? 0) + 1);
    }
  }

  const KNOWN = new Set(['assistant', 'user', 'attachment', 'queue-operation', 'mode', 'last-prompt', 'system', 'summary']);
  for (const r of records) {
    const ty = r.type ?? '<no type>';
    if (!KNOWN.has(ty)) unrecognized.set(ty, (unrecognized.get(ty) ?? 0) + 1);
  }

  const { path, abandoned, forks } = resolveMainPath(records);

  const toolCalls: ToolCall[] = [];
  const capability: CapabilityEvent[] = [];
  const compactions: { index: number; timestamp: string | null }[] = [];
  const models = new Set<string>();

  path.forEach((r, index) => {
    if (r.message?.model) models.add(r.message.model);

    const content = r.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object' && (block as { type?: string }).type === 'tool_use') {
          const b = block as { id?: string; name?: string; input?: Record<string, unknown> };
          toolCalls.push({
            index,
            uuid: typeof b.id === 'string' ? b.id : `${index}`,
            name: typeof b.name === 'string' ? b.name : 'unknown',
            input: (b.input ?? {}) as Record<string, unknown>,
            timestamp: r.timestamp ?? null,
            isSidechain: Boolean(r.isSidechain),
            agentId: typeof r.agentId === 'string' ? r.agentId : null,
          });
        }
      }
    }

    // Compaction leaves a summary record behind. Field naming has moved between
    // versions, so match on any of the shapes we have seen.
    if (
      r.type === 'summary' ||
      r.isCompactSummary === true ||
      (r.message as { isCompactSummary?: boolean } | undefined)?.isCompactSummary === true
    ) {
      compactions.push({ index, timestamp: r.timestamp ?? null });
    }

    const a = r.attachment;
    if (!a || r.type !== 'attachment') return;
    const at = typeof a.type === 'string' ? a.type : '';

    const base = {
      index,
      timestamp: r.timestamp ?? null,
      added: [] as string[],
      removed: [] as string[],
      readded: [] as string[],
      pending: [] as string[],
      needsAuth: [] as string[],
      fullSet: null as string[] | null,
      isInitial: Boolean(a.isInitial),
    };

    if (at === 'skill_listing') {
      capability.push({ ...base, kind: 'skill', fullSet: strList(a.names) });
    } else if (at === 'deferred_tools_delta') {
      capability.push({
        ...base,
        kind: 'tool',
        added: strList(a.addedNames),
        removed: strList(a.removedNames),
        readded: strList(a.readdedNames),
        pending: strList(a.pendingMcpServers),
        needsAuth: strList(a.needsAuthMcpServers),
      });
    } else if (at === 'mcp_instructions_delta') {
      capability.push({
        ...base,
        kind: 'mcp-server',
        added: strList(a.addedNames),
        removed: strList(a.removedNames),
      });
    } else if (at === 'agent_listing_delta') {
      capability.push({
        ...base,
        kind: 'agent',
        added: strList(a.addedTypes),
        removed: strList(a.removedTypes),
      });
    }
  });

  const stamps = path.map((r) => r.timestamp).filter((t): t is string => typeof t === 'string');
  const first = path.find((r) => r.sessionId);

  return {
    sessionId: first?.sessionId ?? null,
    cwd: (path.find((r) => r.cwd)?.cwd as string) ?? null,
    version: (path.find((r) => r.version)?.version as string) ?? null,
    gitBranch: (path.find((r) => r.gitBranch)?.gitBranch as string) ?? null,
    startedAt: stamps[0] ?? null,
    endedAt: stamps[stamps.length - 1] ?? null,
    total: records.length,
    unrecognized: [...unrecognized.entries()].map(([type, count]) => ({ type, count })),
    mainPath: path,
    abandoned,
    forkPoints: forks,
    toolCalls,
    capability,
    compactions,
    sidechainCount: path.filter((r) => r.isSidechain).length,
    models: [...models],
    bytes: text.length,
  };
}
