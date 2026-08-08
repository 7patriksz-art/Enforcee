'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { EvidenceSpan, Receipt, Rule, RuleResult } from '@/lib/types';
import { formatUsd, totalUsd } from '@/lib/cost';
import { Hash, MethodBadge, Stat, VerdictChip } from './primitives';

interface Props {
  receipt: Receipt;
  output: string;
}

/** Render the audited output with every evidence span highlighted, without dangerouslySetInnerHTML. */
function HighlightedOutput({
  output,
  spans,
  bad,
}: {
  output: string;
  spans: EvidenceSpan[];
  bad: Set<string>;
}) {
  const parts = useMemo(() => {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    const merged: (EvidenceSpan & { bad: boolean })[] = [];
    for (const s of sorted) {
      const last = merged[merged.length - 1];
      const isBad = bad.has(`${s.start}:${s.end}`);
      if (last && s.start <= last.end) {
        last.end = Math.max(last.end, s.end);
        last.bad = last.bad || isBad;
      } else {
        merged.push({ ...s, bad: isBad });
      }
    }
    const out: { text: string; mark: false | 'ok' | 'bad' }[] = [];
    let cursor = 0;
    for (const m of merged) {
      if (m.start > cursor) out.push({ text: output.slice(cursor, m.start), mark: false });
      out.push({ text: output.slice(m.start, m.end), mark: m.bad ? 'bad' : 'ok' });
      cursor = m.end;
    }
    if (cursor < output.length) out.push({ text: output.slice(cursor), mark: false });
    return out;
  }, [output, spans, bad]);

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.7] text-neutral-800">
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className={p.mark === 'bad' ? 'ev ev-bad' : 'ev'}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </pre>
  );
}

function CoverageBar({ receipt }: { receipt: Receipt }) {
  const s = receipt.summary;
  const applicable = Math.max(1, s.total - s.notApplicable);
  const seg = [
    { n: s.followed, cls: 'bg-emerald-500', label: 'followed' },
    { n: s.violated, cls: 'bg-red-500', label: 'violated' },
    { n: s.unverifiable, cls: 'bg-amber-400', label: 'unverifiable' },
    { n: s.notApplicable, cls: 'bg-neutral-300', label: 'not applicable' },
  ];
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-200 grow-in origin-left">
        {seg.map((x) =>
          x.n > 0 ? (
            <div
              key={x.label}
              className={x.cls}
              style={{ width: `${(x.n / Math.max(1, s.total)) * 100}%` }}
              title={`${x.n} ${x.label}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-skip">
        {seg.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5">
            <span className={clsx('h-2 w-2 rounded-sm', x.cls)} />
            {x.n} {x.label}
          </span>
        ))}
        <span className="ml-auto">applicable: {applicable}</span>
      </div>
    </div>
  );
}

function RuleRow({ rule, result, output }: { rule: Rule; result: RuleResult; output: string }) {
  const [open, setOpen] = useState(false);
  const missed = !result.engaged && result.verdict !== 'NOT_APPLICABLE';

  return (
    <div className={clsx('border-b hairline last:border-b-0', missed && 'bg-amber-50/30')}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50/80 transition-colors"
      >
        <span className="mt-0.5 w-[86px] shrink-0 font-mono text-[10px] text-neutral-400">{rule.id}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug text-neutral-900">{rule.text}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <MethodBadge method={result.method} />
            {rule.source.section.length > 0 && (
              <span className="font-mono text-[10px] text-neutral-400">{rule.source.section.join(' › ')}</span>
            )}
            {missed && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-800">
                no signal
              </span>
            )}
            {result.downgraded && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-red-800">
                evidence rejected
              </span>
            )}
            {typeof result.agreement === 'number' && result.method === 'judged' && (
              <span className="font-mono text-[10px] text-neutral-400">agreement {Math.round(result.agreement * 100)}%</span>
            )}
          </span>
        </span>
        <VerdictChip verdict={result.verdict} className="mt-0.5" />
      </button>

      {open && (
        <div className="space-y-3 border-t hairline bg-neutral-50/60 px-4 py-3 pl-[110px]">
          <p className="text-[12px] leading-relaxed text-neutral-700">{result.rationale}</p>
          {result.evidence.length > 0 ? (
            <div className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                evidence · verified at these exact offsets
              </div>
              {result.evidence.map((e, i) => (
                <div key={i} className="rounded border hairline bg-white px-3 py-2">
                  <div className="font-mono text-[10px] text-neutral-400">
                    chars {e.start}–{e.end}
                  </div>
                  <div className="mt-1 font-mono text-[12px] leading-relaxed text-neutral-800">
                    {output.slice(e.start, e.end) === e.quote ? (
                      <mark className="ev">{e.quote}</mark>
                    ) : (
                      <span className="text-fail">offset mismatch — evidence rejected</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-neutral-500">
              no evidence span — this verdict rests on the absence of something, or on nothing at all
            </div>
          )}
          <div className="font-mono text-[10px] text-neutral-400">
            checker: {rule.check.kind}
            {rule.trigger ? ` · trigger: ${rule.trigger}` : ''} · line {rule.source.startLine}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceiptView({ receipt, output }: Props) {
  const [filter, setFilter] = useState<'all' | 'problems' | 'nosignal'>('all');
  const byId = useMemo(() => new Map(receipt.rules.map((r) => [r.id, r])), [receipt.rules]);

  const allSpans = receipt.results.flatMap((r) => r.evidence);
  const badKeys = new Set(
    receipt.results.filter((r) => r.verdict === 'VIOLATED').flatMap((r) => r.evidence.map((e) => `${e.start}:${e.end}`))
  );

  const rows = receipt.results.filter((r) => {
    if (filter === 'problems') return r.verdict === 'VIOLATED' || r.verdict === 'UNVERIFIABLE';
    if (filter === 'nosignal') return !r.engaged && r.verdict !== 'NOT_APPLICABLE';
    return true;
  });

  const coveragePct = Math.round(receipt.summary.coverage * 100);
  const spend = totalUsd(receipt.cost);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={`${coveragePct}%`}
          label="Coverage"
          hint="Share of applicable rules the output actually showed a sign of."
          tone={coveragePct >= 70 ? 'good' : coveragePct >= 40 ? 'warn' : 'bad'}
        />
        <Stat
          value={String(receipt.summary.violated)}
          label="Violations"
          hint="Rules the output demonstrably broke."
          tone={receipt.summary.violated === 0 ? 'good' : 'bad'}
        />
        <Stat
          value={String(receipt.summary.unverifiable)}
          label="Unverifiable"
          hint="We could not tell either way. We will not guess."
          tone={receipt.summary.unverifiable === 0 ? 'neutral' : 'warn'}
        />
        <Stat
          value={`${Math.round(receipt.summary.deterministicShare * 100)}%`}
          label="Proven by code"
          hint="Verdicts reached with no model involved at all."
        />
      </div>

      <div className="rounded-lg border hairline bg-white p-4">
        <CoverageBar receipt={receipt} />
      </div>

      {receipt.health.length > 0 && (
        <section className="rounded-lg border hairline bg-white">
          <div className="border-b hairline px-4 py-2.5 text-[13px] font-semibold">
            Ruleset health
            <span className="ml-2 font-mono text-[11px] font-normal text-skip">
              {receipt.health.length} finding{receipt.health.length === 1 ? '' : 's'} · no model used
            </span>
          </div>
          <ul className="divide-y hairline">
            {receipt.health.map((h, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className={clsx(
                    'mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide',
                    h.severity === 'error' && 'bg-red-100 text-red-800',
                    h.severity === 'warn' && 'bg-amber-100 text-amber-800',
                    h.severity === 'info' && 'bg-neutral-100 text-neutral-600'
                  )}
                >
                  {h.code.replace('_', ' ')}
                </span>
                <span className="flex-1 text-[12.5px] leading-relaxed text-neutral-700">{h.message}</span>
                <span className="shrink-0 font-mono text-[10px] text-neutral-400">
                  {h.ruleIds.slice(0, 2).join(' ')}
                  {h.ruleIds.length > 2 ? ` +${h.ruleIds.length - 2}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border hairline bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b hairline px-4 py-2.5">
          <span className="text-[13px] font-semibold">Rule ledger</span>
          <div className="flex gap-1 rounded-md bg-neutral-100 p-0.5">
            {(
              [
                ['all', `All ${receipt.results.length}`],
                ['problems', `Problems ${receipt.summary.violated + receipt.summary.unverifiable}`],
                ['nosignal', 'No signal'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={clsx(
                  'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  filter === k ? 'bg-white text-ink shadow-sm' : 'text-skip hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="ml-auto font-mono text-[10px] text-neutral-400">click a row for evidence</span>
        </div>
        <div>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-skip">Nothing in this filter.</p>
          ) : (
            rows.map((r) => {
              const rule = byId.get(r.ruleId);
              if (!rule) return null;
              return <RuleRow key={r.ruleId} rule={rule} result={r} output={output} />;
            })
          )}
        </div>
      </section>

      <section className="rounded-lg border hairline bg-white">
        <div className="border-b hairline px-4 py-2.5 text-[13px] font-semibold">
          Audited output
          <span className="ml-2 font-mono text-[11px] font-normal text-skip">
            {allSpans.length} evidence span{allSpans.length === 1 ? '' : 's'} highlighted
          </span>
        </div>
        <div className="max-h-[420px] overflow-auto px-4 py-3">
          <HighlightedOutput output={output} spans={allSpans} bad={badKeys} />
        </div>
      </section>

      <section className="rounded-lg border hairline bg-neutral-50/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Hash label="ruleset" value={receipt.rulesetHash} />
          <Hash label="output" value={receipt.outputHash} />
          <Hash label="receipt" value={receipt.digest} />
          {receipt.previousDigest && <Hash label="prev" value={receipt.previousDigest} />}
          <span className="font-mono text-[11px] text-skip">
            engine {receipt.engine.parser} · {receipt.engine.deterministic}
            {receipt.engine.judge ? ` · ${receipt.engine.judge}` : ' · no judge'}
          </span>
          <span className="font-mono text-[11px] text-skip">audit cost {formatUsd(spend)}</span>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `enforcee-receipt-${receipt.digest.slice(0, 12)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="ml-auto rounded-md border hairline bg-white px-2.5 py-1 font-mono text-[11px] hover:bg-neutral-50"
          >
            download receipt.json
          </button>
        </div>
        <p className="mt-2 max-w-3xl font-mono text-[10px] leading-relaxed text-neutral-400">
          The receipt digest is sha256 over the canonical JSON of everything above. Change one verdict and the digest
          stops matching. You can recompute it yourself from the downloaded file.
        </p>
      </section>
    </div>
  );
}
