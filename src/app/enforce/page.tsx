'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { SAMPLES } from '@/lib/samples';

interface Proposal {
  id: string;
  rule: string;
  tool: string;
  pattern: string;
  flags?: string;
  reason?: string;
  basis: string;
  defaultOn: boolean;
  severity: 'deny' | 'warn';
}

export default function EnforcePage() {
  const [ruleset, setRuleset] = useState(SAMPLES[0].ruleset);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [ruleCount, setRuleCount] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/enforce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed.');
      setProposals(json.proposals as Proposal[]);
      setRuleCount(json.ruleCount as number);
      setPicked(new Set((json.proposals as Proposal[]).filter((p) => p.defaultOn).map((p) => p.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    const res = await fetch('/api/enforce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleset, chosen: [...picked], merge: true }),
    });
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/x-shellscript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enforcee-install.sh';
    a.click();
    URL.revokeObjectURL(url);
  }

  const denyOn = proposals?.filter((p) => picked.has(p.id) && p.severity === 'deny').length ?? 0;
  const warnOn = proposals?.filter((p) => picked.has(p.id) && p.severity === 'warn').length ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight">Enforce</h1>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-neutral-600">
        Auditing tells you what already went wrong. This stops it. Enforcee compiles your rules into a guard that runs
        inside Claude Code and denies a tool call <em>before</em> it executes — and puts your rules back into context
        automatically after every compaction, which is the moment they are documented to fall out.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Block', 'A forbidden command never runs. The model is told why, in your own words, and told not to retry.'],
          ['Repair', 'After a compaction your ruleset is re-injected on the next turn, before the model acts again.'],
          ['Record', 'Every allow, warn and deny is appended to a local ledger you own.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border hairline bg-white px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-skip">{t}</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-600">{d}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border hairline bg-white">
        <div className="flex items-baseline justify-between border-b hairline px-3 py-2">
          <span className="text-[13px] font-semibold">Your rules</span>
          <span className="font-mono text-[10px] text-neutral-400">{ruleset.length.toLocaleString()} chars</span>
        </div>
        <textarea
          value={ruleset}
          onChange={(e) => setRuleset(e.target.value)}
          spellCheck={false}
          className="h-[200px] w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-[1.65] outline-none"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={analyse}
          disabled={busy}
          className="rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft disabled:opacity-50 transition-colors"
        >
          {busy ? 'Compiling…' : 'Compile a guard'}
        </button>
        {proposals && (
          <span className="font-mono text-[11px] text-skip">
            {ruleCount} rules parsed · {proposals.length} enforceable actions proposed
          </span>
        )}
      </div>

      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>}

      {proposals && (
        <div className="mt-7 space-y-5">
          <section className="rounded-lg border hairline bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b hairline px-4 py-2.5">
              <span className="text-[13px] font-semibold">What the guard will do</span>
              <span className="font-mono text-[11px] text-skip">
                {denyOn} blocking · {warnOn} warning
              </span>
              <span className="ml-auto font-mono text-[10px] text-neutral-400">nothing is enforced until you tick it</span>
            </div>
            <ul className="divide-y hairline">
              {proposals.map((p) => {
                const on = picked.has(p.id);
                return (
                  <li key={p.id} className={clsx('flex items-start gap-3 px-4 py-3', on && 'bg-emerald-50/25')}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setPicked(next);
                      }}
                      className="mt-1 h-4 w-4 shrink-0 accent-neutral-900"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={clsx(
                            'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                            p.severity === 'deny' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          )}
                        >
                          {p.severity === 'deny' ? 'block' : 'warn'}
                        </span>
                        <span className="text-[13px] text-neutral-900">{p.rule}</span>
                        <span className="font-mono text-[10px] text-neutral-400">{p.tool}</span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-neutral-500">/{p.pattern}/{p.flags ?? 'i'}</div>
                      <div className="mt-0.5 text-[11.5px] text-skip">{p.basis}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-lg border hairline bg-white px-4 py-4">
            <h2 className="text-[14px] font-semibold tracking-tight">Install it</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-neutral-600">
              <li>Download the script and open it. It is plain text and every line is readable.</li>
              <li>
                Run it from your project root: <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12px]">bash enforcee-install.sh</code>
              </li>
              <li>Restart Claude Code.</li>
            </ol>
            <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-skip">
              It writes three files: the compiled policy, a dependency-free runner, and the hook wiring. If you already
              have a <code className="font-mono">.claude/settings.json</code> it merges rather than overwrites. There is
              no curl-piped-to-shell one-liner on purpose — the guard blocks that pattern by default, and shipping an
              installer that does the thing we tell you never to do would be a poor start.
            </p>
            <button
              onClick={download}
              className="mt-4 rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft transition-colors"
            >
              Download enforcee-install.sh
            </button>
          </section>

          <section className="rounded-lg border hairline bg-neutral-50/70 px-4 py-3">
            <p className="max-w-4xl font-mono text-[10px] leading-relaxed text-neutral-400">
              Limits, stated plainly. The guard sees tool calls, not thoughts: it can stop an action, not an intention.
              It runs where Claude Code runs hooks, which does not include every surface. Re-injection puts your rules
              back into context; it cannot force the model to weigh them. And a guard that blocks ordinary work gets
              uninstalled by Friday, so anything ambiguous is proposed to you switched off.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
