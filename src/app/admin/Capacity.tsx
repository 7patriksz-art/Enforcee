import clsx from 'clsx';
import { ceilingsBySeverity, estimateDbBytes, SUPABASE_FREE_DB_BYTES, type Ceiling } from '@/lib/capacity';

const TINT: Record<Ceiling['severity'], { cls: string; label: string }> = {
  policy: { cls: 'border-fail-line bg-fail-pale text-fail', label: 'terms, not usage' },
  'first-to-break': { cls: 'border-clay-line bg-clay-pale text-clay', label: 'breaks first' },
  watch: { cls: 'border-unknown-line bg-unknown-pale text-unknown', label: 'watch' },
  'far-off': { cls: 'hairline bg-paper-soft text-skip', label: 'far off' },
};

export default function Capacity({ auditCount }: { auditCount: number }) {
  const used = estimateDbBytes(auditCount);
  const pct = Math.min(100, (used / SUPABASE_FREE_DB_BYTES) * 100);

  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-[22px] tracking-tight">When we outgrow our own tools</h2>
        <span className="font-mono text-[11px] text-skip">read off each vendor&apos;s limits page, 2026-08-08</span>
      </div>

      <div className="mb-5 rounded-2xl border hairline bg-white px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13.5px] font-semibold">Database, the ceiling we hit first</span>
          <span className="font-mono text-[11.5px] text-skip">
            {auditCount.toLocaleString()} saved audits · ~{(used / 1024 / 1024).toFixed(1)} MB of 500 MB
          </span>
        </div>
        <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-paper-deep">
          <div
            className={clsx('h-full grow-in origin-left', pct > 70 ? 'bg-fail' : pct > 40 ? 'bg-unknown' : 'bg-pass')}
            style={{ width: `${Math.max(1.5, pct)}%` }}
          />
        </div>
        <p className="mt-2.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-mid">
          Estimated at ~90 KB a row, because each audit stores the sealed receipt plus the audited output in full.
          Truncating <code className="font-mono">output_text</code> to the evidence spans cuts that by roughly four
          fifths and is the cheaper move before paying anyone.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border hairline">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-paper-soft text-[10px] uppercase tracking-wide text-skip">
              <th className="px-4 py-2.5 font-medium">Service</th>
              <th className="px-4 py-2.5 font-medium">Ceiling</th>
              <th className="px-4 py-2.5 font-medium">Headroom</th>
              <th className="px-4 py-2.5 font-medium">Upgrade when</th>
            </tr>
          </thead>
          <tbody className="divide-y hairline bg-white">
            {ceilingsBySeverity().map((c) => (
              <tr key={`${c.service}-${c.limit}`}>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-ink">{c.service}</div>
                  <div className="font-mono text-[10px] text-skip">{c.plan}</div>
                  <span
                    className={clsx(
                      'mt-1.5 inline-block rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide',
                      TINT[c.severity].cls
                    )}
                  >
                    {TINT[c.severity].label}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="text-ink">{c.limit}</div>
                  <div className="mt-1 text-[11.5px] leading-snug text-ink-light">{c.consumedBy}</div>
                </td>
                <td className="px-4 py-3 align-top text-ink-mid">{c.headroom}</td>
                <td className="px-4 py-3 align-top">
                  <div className="text-ink">{c.trigger}</div>
                  <div className="mt-1 text-[11.5px] leading-snug text-ink-light">{c.upgrade}</div>
                  <a href={c.source} target="_blank" rel="noreferrer" className="mt-1 block font-mono text-[10px] text-brand hover:underline">
                    source
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
