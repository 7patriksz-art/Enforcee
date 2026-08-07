import { describe, expect, it } from 'vitest';
import { parseTranscript, resolveMainPath, type RawRecord } from '@/lib/transcript/parse';
import { analyseCapabilities, runPredicates } from '@/lib/transcript/findings';

const rec = (o: Partial<RawRecord>): string => JSON.stringify(o);

function build(lines: object[]): string {
  return lines.map((l) => JSON.stringify(l)).join('\n');
}

const SESSION = build([
  { type: 'user', uuid: 'a', parentUuid: null, timestamp: '2026-08-07T10:00:00Z', sessionId: 's1', cwd: '/proj', version: '2.1.0', gitBranch: 'main' },
  {
    type: 'attachment',
    attachment: {
      type: 'deferred_tools_delta',
      addedNames: ['WebSearch', 'mcp__figma__get'],
      removedNames: [],
      readdedNames: [],
      pendingMcpServers: ['linear', 'notion'],
      needsAuthMcpServers: [],
    },
  },
  { type: 'attachment', attachment: { type: 'skill_listing', isInitial: true, skillCount: 3, names: ['docx', 'xlsx', 'pdf'] } },
  {
    type: 'assistant',
    uuid: 'b',
    parentUuid: 'a',
    timestamp: '2026-08-07T10:01:00Z',
    message: { role: 'assistant', model: 'claude-opus-5', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/proj/ARCHITECTURE.md' } }] },
  },
  {
    type: 'assistant',
    uuid: 'c',
    parentUuid: 'b',
    timestamp: '2026-08-07T10:02:00Z',
    message: { role: 'assistant', model: 'claude-opus-5', content: [{ type: 'tool_use', id: 't2', name: 'Skill', input: { skill: 'docx' } }] },
  },
  {
    type: 'assistant',
    uuid: 'd',
    parentUuid: 'c',
    timestamp: '2026-08-07T10:03:00Z',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'npx supabase db push --linked' } }] },
  },
  {
    type: 'assistant',
    uuid: 'e',
    parentUuid: 'd',
    timestamp: '2026-08-07T10:04:00Z',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 't4', name: 'Edit', input: { file_path: '/proj/src/a.ts' } }] },
  },
  // Capability changes later: linear never resolves, notion needs auth, WebSearch withdrawn.
  {
    type: 'attachment',
    attachment: {
      type: 'deferred_tools_delta',
      addedNames: [],
      removedNames: ['WebSearch'],
      readdedNames: [],
      pendingMcpServers: ['linear'],
      needsAuthMcpServers: ['notion'],
    },
  },
  { type: 'attachment', attachment: { type: 'skill_listing', skillCount: 2, names: ['docx', 'xlsx'] } },
]);

describe('transcript parsing', () => {
  const s = parseTranscript(SESSION);

  it('reads session metadata', () => {
    expect(s.sessionId).toBe('s1');
    expect(s.cwd).toBe('/proj');
    expect(s.gitBranch).toBe('main');
    expect(s.models).toContain('claude-opus-5');
  });

  it('extracts every tool call in order', () => {
    expect(s.toolCalls.map((c) => c.name)).toEqual(['Read', 'Skill', 'Bash', 'Edit']);
  });

  it('extracts capability events', () => {
    expect(s.capability.filter((c) => c.kind === 'tool')).toHaveLength(2);
    expect(s.capability.filter((c) => c.kind === 'skill')).toHaveLength(2);
  });

  it('counts records and reports unrecognized types honestly', () => {
    expect(s.total).toBe(9);
    expect(s.unrecognized).toEqual([]);
  });

  it('flags an unknown record type rather than swallowing it', () => {
    const weird = parseTranscript(SESSION + '\n' + rec({ type: 'brand-new-thing', uuid: 'z' }));
    expect(weird.unrecognized).toContainEqual({ type: 'brand-new-thing', count: 1 });
  });
});

describe('DAG resolution', () => {
  it('drops the abandoned branch of a rewind', () => {
    const records: RawRecord[] = [
      { type: 'user', uuid: 'a', parentUuid: null },
      { type: 'assistant', uuid: 'b1', parentUuid: 'a' },
      { type: 'assistant', uuid: 'b2', parentUuid: 'a' },
      { type: 'assistant', uuid: 'c', parentUuid: 'b2' },
    ];
    const { path, abandoned, forks } = resolveMainPath(records);
    expect(path.map((r) => r.uuid)).toEqual(['a', 'b2', 'c']);
    expect(abandoned).toBe(1);
    expect(forks).toEqual(['a']);
  });

  it('keeps uuid-less metadata records on the path', () => {
    const records: RawRecord[] = [
      { type: 'user', uuid: 'a', parentUuid: null },
      { type: 'attachment', attachment: { type: 'skill_listing', names: ['docx'] } },
      { type: 'assistant', uuid: 'b', parentUuid: 'a' },
    ];
    expect(resolveMainPath(records).path).toHaveLength(3);
  });

  it('does not loop on a cyclic parent chain', () => {
    const records: RawRecord[] = [
      { type: 'user', uuid: 'a', parentUuid: 'b' },
      { type: 'assistant', uuid: 'b', parentUuid: 'a' },
    ];
    expect(resolveMainPath(records).path.length).toBeLessThanOrEqual(2);
  });
});

describe('capability findings', () => {
  const f = analyseCapabilities(parseTranscript(SESSION));
  const by = (code: string) => f.find((x) => x.code === code);

  it('reports an MCP server that never finished connecting', () => {
    const x = by('mcp_never_connected');
    expect(x).toBeDefined();
    expect(x!.items).toContain('linear');
    expect(x!.evidence).toBe('OBSERVED');
  });

  it('reports an MCP server stuck behind auth', () => {
    expect(by('mcp_needs_auth')!.items).toEqual(['notion']);
  });

  it('reports a tool that was withdrawn and never restored', () => {
    expect(by('tool_removed')!.items).toEqual(['WebSearch']);
  });

  it('reports a skill that stopped being offered', () => {
    const x = by('skill_listing_shrank');
    expect(x).toBeDefined();
    expect(x!.items).toEqual(['pdf']);
    expect(x!.severity).toBe('error');
  });

  it('separates skills that were offered from skills that were used', () => {
    const x = by('skill_offered_never_used')!;
    expect(x.items.sort()).toEqual(['pdf', 'xlsx']);
    expect(x.evidence).toBe('DERIVED');
  });

  it('never claims to know what was in the model context', () => {
    for (const x of f) {
      expect(x.detail.toLowerCase()).not.toMatch(/rules? (were|was) (in|loaded into) (the )?context/);
    }
  });
});

describe('user-authored predicates', () => {
  const s = parseTranscript(SESSION);

  it('catches a forbidden shell command with the command as evidence', () => {
    const [r] = runPredicates(s, [{ kind: 'forbid_bash', pattern: 'supabase\\s+db\\s+push' }]);
    expect(r.code).toBe('predicate_violated');
    expect(r.items[0]).toContain('supabase db push');
    expect(r.evidence).toBe('OBSERVED');
  });

  it('passes a forbidden command that never ran', () => {
    const [r] = runPredicates(s, [{ kind: 'forbid_bash', pattern: 'rm\\s+-rf\\s+/' }]);
    expect(r.code).toBe('predicate_satisfied');
  });

  it('verifies read-before-edit ordering', () => {
    const [ok] = runPredicates(s, [{ kind: 'require_read_before_edit', file: 'ARCHITECTURE.md' }]);
    expect(ok.code).toBe('predicate_satisfied');
    const [bad] = runPredicates(s, [{ kind: 'require_read_before_edit', file: 'CONTRIBUTING.md' }]);
    expect(bad.code).toBe('predicate_violated');
  });

  it('verifies skill invocation', () => {
    expect(runPredicates(s, [{ kind: 'require_skill', skill: 'docx' }])[0].code).toBe('predicate_satisfied');
    expect(runPredicates(s, [{ kind: 'require_skill', skill: 'pptx' }])[0].code).toBe('predicate_violated');
  });

  it('does not crash on an invalid regex', () => {
    const [r] = runPredicates(s, [{ kind: 'forbid_bash', pattern: '([' }]);
    expect(r.severity).toBe('warn');
    expect(r.detail).toMatch(/not a valid regular expression/);
  });

  it('treats forbid_tool and require_tool symmetrically', () => {
    expect(runPredicates(s, [{ kind: 'forbid_tool', tool: 'Bash' }])[0].code).toBe('predicate_violated');
    expect(runPredicates(s, [{ kind: 'require_tool', tool: 'Read' }])[0].code).toBe('predicate_satisfied');
    expect(runPredicates(s, [{ kind: 'require_tool', tool: 'WebFetch' }])[0].code).toBe('predicate_violated');
  });
});
