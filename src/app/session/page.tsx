'use client';

import { useCallback, useMemo, useState } from 'react';
import PageHead from '@/components/PageHead';
import clsx from 'clsx';
import { parseTranscript, type ParsedSession } from '@/lib/transcript/parse';
import { analyseCapabilities, describePredicate, runPredicates, type Predicate, type SessionFinding } from '@/lib/transcript/findings';
import { Stat } from '@/components/primitives';

const DEFAULT_PREDICATES: Predicate[] = [
  { kind: 'forbid_bash', pattern: 'rm\\s+-rf\\s+/' },
  { kind: 'forbid_bash', pattern: 'git\\s+push\\s+(--force|-f)\\b' },
  { kind: 'forbid_bash', pattern: 'supabase\\s+db\\s+push' },
];

const SEVERITY: Record<SessionFinding['severity'], { cls: string; label: string }> = {
  error: { cls: 'bg-red-50 text-red-800 ring-red-600/20', label: 'problem' },
  warn: { cls: 'bg-amber-50 text-amber-800 ring-amber-600/20', label: 'attention' },
  info: { cls: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20', label: 'note' },
  ok: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20', label: 'clear' },
};

export default function SessionPage() {
  const [session, setSession] = useState<ParsedSession | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [predicateText, setPredicateText] = useState(
    'forbid_bash rm\\s+-rf\\s+/\nforbid_bash git\\s+push\\s+(--force|-f)\\b\nforbid_bash supabase\\s+db\\s+push'
  );

  const predicates = useMemo(() => parsePredicates(predicateText), [predicateText]);

  const findings = useMemo(() => {
    if (!session) return [];
    const rank = { error: 0, warn: 1, info: 2, ok: 3 } as const;
    return [...analyseCapabilities(session), ...runPredicates(session, predicates)].sort(
      (a, b) => rank[a.severity] - rank[b.severity]
    );
  }, [session, predicates]);

  const load = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseTranscript(text);
      if (parsed.total === 0) throw new Error('That file has no readable JSONL records.');
      setSession(parsed);
      setFileName(file.name);
    } catch (e) {
      setSession(null);
      setError((e as Error).message);
    }
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <PageHead
        wide
        eyebrow="from your own transcript"
        title="What the model could actually see"
        lede={
          <>
            Drop a Claude Code session file. Enforcee reads which skills were offered, which MCP servers never
            finished connecting, which tools vanished mid-session — and whether your hard rules held.
          </>
        }
      />

      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-600/25 bg-emerald-50/60 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-emerald-800">local only</span>
        <span className="text-[12px] text-emerald-900">
          The file is parsed in your browser. Nothing is uploaded, stored, or sent anywhere.
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void load(f);
        }}
        className={clsx(
          'mt-5 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-brand bg-blue-50/50' : 'border-paper-line bg-white'
        )}
      >
        <p className="text-[14px] font-medium">Drop a <code className="font-mono text-[13px]">.jsonl</code> session file here</p>
        <p className="mx-auto mt-2 max-w-xl font-mono text-[11px] leading-relaxed text-skip">
          macOS / Linux: ~/.claude/projects/&lt;project&gt;/&lt;session-id&gt;.jsonl
          <br />
          Windows: %USERPROFILE%\.claude\projects\&lt;project&gt;\&lt;session-id&gt;.jsonl
        </p>
        <label className="mt-4 inline-block cursor-pointer rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft transition-colors">
          Choose a file
          <input
            type="file"
            accept=".jsonl,.json,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
            }}
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>
      )}

      {session && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat value={String(session.total)} label="Records" hint={`${fileName} · ${(session.bytes / 1024).toFixed(0)} KB`} />
            <Stat value={String(session.toolCalls.length)} label="Tool calls" hint="Every action the model actually took." />
            <Stat
              value={String(session.abandoned)}
              label="Abandoned records"
              hint={`${session.forkPoints.length} rewind point(s). Excluded from the analysis.`}
              tone={session.abandoned > 0 ? 'warn' : 'neutral'}
            />
            <Stat
              value={String(findings.filter((f) => f.severity === 'error').length)}
              label="Problems"
              hint="Things that were provably missing or broken."
              tone={findings.some((f) => f.severity === 'error') ? 'bad' : 'good'}
            />
          </div>

          <section className="rounded-lg border hairline bg-white">
            <div className="border-b hairline px-4 py-2.5 text-[13px] font-semibold">
              Your hard rules
              <span className="ml-2 font-mono text-[11px] font-normal text-skip">
                one per line · you write the predicate, we execute it over the tool calls
              </span>
            </div>
            <textarea
              value={predicateText}
              onChange={(e) => setPredicateText(e.target.value)}
              spellCheck={false}
              className="h-[92px] w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-[1.7] outline-none"
            />
            <p className="border-t hairline px-3 py-1.5 font-mono text-[10.5px] leading-relaxed text-skip">
              forbid_bash &lt;regex&gt; · require_tool &lt;Name&gt; · forbid_tool &lt;Name&gt; · require_skill &lt;name&gt; ·
              require_read_before_edit &lt;file&gt;
            </p>
          </section>

          <section className="rounded-lg border hairline bg-white">
            <div className="border-b hairline px-4 py-2.5 text-[13px] font-semibold">
              Findings
              <span className="ml-2 font-mono text-[11px] font-normal text-skip">{findings.length} total</span>
            </div>
            <ul className="divide-y hairline">
              {findings.map((f, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={clsx(
                        'rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                        SEVERITY[f.severity].cls
                      )}
                    >
                      {SEVERITY[f.severity].label}
                    </span>
                    <span className="text-[13px] font-medium text-neutral-900">{f.title}</span>
                    <span
                      title={
                        f.evidence === 'OBSERVED'
                          ? 'Read directly out of the session file. Not inferred.'
                          : 'Computed from observed facts, not read directly.'
                      }
                      className={clsx(
                        'cursor-help rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                        f.evidence === 'OBSERVED'
                          ? 'border-emerald-600/25 bg-emerald-50/60 text-emerald-800'
                          : 'border-neutral-300 bg-neutral-50 text-neutral-500'
                      )}
                    >
                      {f.evidence}
                    </span>
                    {f.anchors.length > 0 && (
                      <span className="font-mono text-[10px] text-neutral-400">record {f.anchors.slice(0, 4).join(', ')}</span>
                    )}
                  </div>
                  <p className="mt-1.5 max-w-4xl text-[12.5px] leading-relaxed text-neutral-600">{f.detail}</p>
                  {f.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {f.items.slice(0, 24).map((it) => (
                        <span key={it} className="rounded border hairline bg-neutral-50 px-1.5 py-0.5 font-mono text-[10.5px] text-neutral-700">
                          {it}
                        </span>
                      ))}
                      {f.items.length > 24 && (
                        <span className="font-mono text-[10.5px] text-neutral-400">+{f.items.length - 24} more</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border hairline bg-neutral-50/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px] text-skip">
              <span>session {session.sessionId?.slice(0, 8) ?? 'unknown'}</span>
              <span>cwd {session.cwd ?? '—'}</span>
              <span>cli {session.version ?? '—'}</span>
              <span>branch {session.gitBranch ?? '—'}</span>
              <span>models {session.models.join(', ') || '—'}</span>
              {session.unrecognized.length > 0 && (
                <span className="text-unknown">
                  unrecognized records: {session.unrecognized.map((u) => `${u.type}×${u.count}`).join(', ')}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-4xl font-mono text-[10px] leading-relaxed text-neutral-400">
              What this cannot tell you: the session file contains no system prompt and no CLAUDE.md content, so nobody
              can prove from it which instructions were in the model&apos;s context on a given turn. Enforcee does not
              claim to. Everything above is either read straight out of the file or computed from something that was.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

function parsePredicates(text: string): Predicate[] {
  const out: Predicate[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sp = line.indexOf(' ');
    if (sp === -1) continue;
    const kind = line.slice(0, sp).trim();
    const arg = line.slice(sp + 1).trim();
    if (!arg) continue;
    if (kind === 'forbid_bash') out.push({ kind: 'forbid_bash', pattern: arg });
    else if (kind === 'forbid_tool') out.push({ kind: 'forbid_tool', tool: arg });
    else if (kind === 'require_tool') out.push({ kind: 'require_tool', tool: arg });
    else if (kind === 'require_skill') out.push({ kind: 'require_skill', skill: arg });
    else if (kind === 'require_read_before_edit') out.push({ kind: 'require_read_before_edit', file: arg });
  }
  return out.length ? out : DEFAULT_PREDICATES;
}

void describePredicate;
