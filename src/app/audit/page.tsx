'use client';

import { useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import ReceiptView from '@/components/ReceiptView';
import { SAMPLES } from '@/lib/samples';
import type { Receipt } from '@/lib/types';

interface AuditResponse {
  receipt: Receipt;
  judgeAvailable: boolean;
  mode: 'deterministic' | 'full';
  quotaNote?: string;
  gateNote?: string;
  plan: 'free' | 'builder' | 'founder';
  stored?: { saved: boolean; reason?: string };
}

export default function AuditPage() {
  const [ruleset, setRuleset] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [audited, setAudited] = useState('');

  async function run(deterministicOnly: boolean) {
    if (!ruleset.trim() || !output.trim()) {
      setError('Both panes need content: the rules you set, and the output you want checked.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset, output, deterministicOnly, previousDigest: data?.receipt.digest ?? null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Audit failed.');
      setAudited(output);
      setData(json as AuditResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">Run an audit</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-neutral-600">
          Paste the rules you gave your assistant on the left, and something it produced on the right. Enforcee returns a
          verdict for every single rule, the evidence behind it, and an honest list of what it could not verify.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-400">try a sample</span>
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            title={s.blurb}
            onClick={() => {
              setRuleset(s.ruleset);
              setOutput(s.output);
              setData(null);
              setError(null);
            }}
            className="rounded-md border hairline bg-white px-2.5 py-1 text-[12px] hover:border-brand hover:text-brand-deep transition-colors"
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Pane
          label="Your rules"
          hint="CLAUDE.md, AGENTS.md, .cursorrules, a system prompt, custom instructions — paste it raw."
          value={ruleset}
          onChange={setRuleset}
          placeholder={'# House rules\n- Never use emojis.\n- Keep answers under 120 words.\n- Always cite sources with links.'}
        />
        <Pane
          label="What the AI produced"
          hint="One response, or a whole transcript. This is the text we search for evidence."
          value={output}
          onChange={setOutput}
          placeholder="Paste the assistant's answer here."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(false)}
          disabled={busy}
          className="rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft disabled:opacity-50 transition-colors"
        >
          {busy ? 'Auditing…' : 'Run full audit'}
        </button>
        <button
          onClick={() => run(true)}
          disabled={busy}
          className="rounded-md border hairline bg-white px-4 py-2 text-[13px] font-medium hover:bg-neutral-50 disabled:opacity-50 transition-colors"
        >
          Deterministic only · free, no model
        </button>
        {data && (
          <span className="font-mono text-[11px] text-skip">
            mode: {data.mode}
            {!data.judgeAvailable && ' · no judge configured on this deployment'}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>
      )}

      {data?.quotaNote && (
        <p className="mt-4 rounded-md border border-unknown-line bg-unknown-pale px-3 py-2 text-[12.5px] text-unknown">
          {data.quotaNote}
        </p>
      )}

      {data?.gateNote && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-honey-line bg-honey-pale px-3 py-2 text-[12.5px] text-ink">
          <span>{data.gateNote}</span>
          <Link href="/pricing" className="font-medium text-brand hover:underline">
            See what Builder adds →
          </Link>
        </p>
      )}

      {data && data.plan === 'free' && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border hairline bg-paper-soft px-3 py-2 text-[12.5px] text-ink-mid">
          <span>
            This receipt is not being saved. Close the tab and it is gone — download the JSON if you want to keep it.
          </span>
          <Link href="/pricing" className="font-medium text-brand hover:underline">
            Keep every audit →
          </Link>
        </p>
      )}

      {data && (
        <div className="mt-8">
          <ReceiptView receipt={data.receipt} output={audited} />
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
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const lines = value ? value.split('\n').length : 0;
  return (
    <div className="rounded-lg border hairline bg-white">
      <div className="flex items-baseline justify-between border-b hairline px-3 py-2">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="font-mono text-[10px] text-neutral-400">
          {value.length.toLocaleString()} chars · {lines} lines
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={clsx(
          'h-[280px] w-full resize-y bg-transparent px-3 py-2.5 font-mono text-[12px] leading-[1.65]',
          'outline-none placeholder:text-neutral-300'
        )}
      />
      <p className="border-t hairline px-3 py-1.5 text-[11px] text-skip">{hint}</p>
    </div>
  );
}
