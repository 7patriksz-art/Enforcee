'use client';

import { useState } from 'react';
import clsx from 'clsx';

interface Candidate {
  id: string;
  rule: string;
  polarity: 'require' | 'forbid';
  strength: 'strong' | 'medium' | 'weak';
  basis: string;
  quote: string;
  start: number;
  end: number;
  check: string;
  alreadyCovered: boolean;
}

const SAMPLE = `Can you rewrite this section for me?

Actually stop opening every answer with a summary. I hate when you restate my question back at me.

I'd rather you show the code first and explain after. Always use pnpm in this repo, never npm.

Please don't apologise when you get something wrong, just fix it.

I like it when you flag the tradeoff instead of picking for me.`;

export default function LearnPage() {
  const [conversation, setConversation] = useState(SAMPLE);
  const [existingRuleset, setExistingRuleset] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setBusy(true);
    setError(null);
    setMarkdown('');
    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation, existingRuleset }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed.');
      setCandidates(json.candidates as Candidate[]);
      setPicked(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    const res = await fetch('/api/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation, existingRuleset, accept: [...picked] }),
    });
    const json = await res.json();
    setMarkdown(json.markdown ?? '');
  }

  const fresh = candidates?.filter((c) => !c.alreadyCovered) ?? [];
  const covered = candidates?.filter((c) => c.alreadyCovered) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight">Learn</h1>
      <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-neutral-600">
        Most of your rules were never written down. You said them once — <em>stop doing that</em>,{' '}
        <em>I&apos;d rather you</em>, <em>always use</em> — and they decayed out of the conversation. Paste what you
        actually said and Enforcee proposes the rules hiding in it, each one carrying the sentence that produced it.
      </p>

      <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-600/25 bg-amber-50/70 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-amber-800">inferred</span>
        <span className="text-[12px] text-amber-900">
          This reads natural language, so nothing here is switched on for you. You promote a rule, or it stays a
          suggestion.
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Pane
          label="What you said"
          hint="A conversation, a chat export, or the human turns from a session. Only your words are read — never the assistant's."
          value={conversation}
          onChange={setConversation}
          height="h-[260px]"
        />
        <Pane
          label="Rules you already have"
          hint="Optional. Paste your CLAUDE.md and anything already covered gets flagged instead of proposed twice."
          value={existingRuleset}
          onChange={setExistingRuleset}
          height="h-[260px]"
          placeholder={'# Project rules\n- Never use emojis.'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={scan}
          disabled={busy}
          className="rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft disabled:opacity-50 transition-colors"
        >
          {busy ? 'Reading…' : 'Find the rules'}
        </button>
        {candidates && (
          <span className="font-mono text-[11px] text-skip">
            {fresh.length} new · {covered.length} already covered
          </span>
        )}
      </div>

      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>}

      {candidates && (
        <div className="mt-7 space-y-5">
          <section className="rounded-lg border hairline bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b hairline px-4 py-2.5">
              <span className="text-[13px] font-semibold">Rules found in what you said</span>
              <span className="ml-auto font-mono text-[10px] text-neutral-400">tick what you want to keep</span>
            </div>
            {candidates.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-skip">
                Nothing checkable in there. Vague statements are skipped on purpose — a rule nobody could audit is worse
                than no rule.
              </p>
            ) : (
              <ul className="divide-y hairline">
                {candidates.map((c) => {
                  const on = picked.has(c.id);
                  return (
                    <li key={c.id} className={clsx('flex items-start gap-3 px-4 py-3', on && 'bg-emerald-50/25', c.alreadyCovered && 'opacity-60')}>
                      <input
                        type="checkbox"
                        disabled={c.alreadyCovered}
                        checked={on}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          setPicked(next);
                        }}
                        className="mt-1 h-4 w-4 shrink-0 accent-neutral-900"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={clsx(
                              'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                              c.strength === 'strong' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700'
                            )}
                          >
                            {c.strength}
                          </span>
                          <span className="text-[13.5px] text-neutral-900">{c.rule}</span>
                          <span className="font-mono text-[10px] text-neutral-400">{c.check}</span>
                          {c.alreadyCovered && (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-neutral-500">
                              already a rule
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 border-l-2 border-neutral-200 pl-2.5">
                          <span className="font-mono text-[11.5px] leading-relaxed text-neutral-600">
                            <mark className="ev">{c.quote}</mark>
                          </span>
                        </div>
                        <div className="mt-1 text-[11.5px] text-skip">
                          {c.basis} · chars {c.start}–{c.end}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {picked.size > 0 && (
            <section className="rounded-lg border hairline bg-white px-4 py-4">
              <h2 className="text-[14px] font-semibold tracking-tight">Add {picked.size} rule{picked.size === 1 ? '' : 's'} to your ruleset</h2>
              <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-neutral-600">
                Each line keeps its id and the sentence it came from, as a comment. Six months from now you will be able
                to see why a rule exists, which is the difference between a ruleset you trust and one you are afraid to
                delete from.
              </p>
              <button
                onClick={promote}
                className="mt-3 rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft transition-colors"
              >
                Generate the markdown
              </button>
              {markdown && (
                <>
                  <pre className="mt-4 max-h-[300px] overflow-auto rounded-md border hairline bg-neutral-50 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
                    {markdown}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(markdown)}
                      className="rounded-md border hairline bg-white px-3 py-1.5 font-mono text-[11px] hover:bg-neutral-50"
                    >
                      copy
                    </button>
                    <a
                      href="/enforce"
                      className="rounded-md border hairline bg-white px-3 py-1.5 font-mono text-[11px] hover:bg-neutral-50"
                    >
                      compile a guard from these →
                    </a>
                    <a
                      href="/audit"
                      className="rounded-md border hairline bg-white px-3 py-1.5 font-mono text-[11px] hover:bg-neutral-50"
                    >
                      audit an output against these →
                    </a>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function Pane({
  label,
  hint,
  value,
  onChange,
  height,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  height: string;
  placeholder?: string;
}) {
  return (
    <div className="rounded-lg border hairline bg-white">
      <div className="flex items-baseline justify-between border-b hairline px-3 py-2">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="font-mono text-[10px] text-neutral-400">{value.length.toLocaleString()} chars</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={clsx(height, 'w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-[1.65] outline-none placeholder:text-neutral-300')}
      />
      <p className="border-t hairline px-3 py-1.5 text-[11px] text-skip">{hint}</p>
    </div>
  );
}
