import type { AdminMetrics } from '@/lib/admin-metrics';

/**
 * D-018: this component renders our unit cost. It must never be imported by any page
 * outside /admin, which is gated by an explicit email allowlist that fails closed when
 * ADMIN_EMAILS is empty.
 */

const usd = (n: number, dp = 2) => `$${n.toFixed(dp)}`;
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

function Stat({ k, v, note, alarm }: { k: string; v: string; note?: string; alarm?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${alarm ? 'border-fail-line bg-fail-pale' : 'hairline bg-white'}`}>
      <div className="font-mono text-[22px] leading-none tracking-tight">{v}</div>
      <div className="mt-1.5 text-[12.5px] font-medium">{k}</div>
      {note && <div className="mt-0.5 text-[11.5px] leading-snug text-ink-mid">{note}</div>}
    </div>
  );
}

export default function Metrics({ m }: { m: AdminMetrics | null }) {
  if (!m) return null;

  // The margin thesis in one line: the product is ~80% deterministic, so cost per audit
  // stays near zero. If the deterministic share falls, cost per audit rises and the
  // pricing stops working — so they are shown side by side rather than pages apart.
  const shareLow = m.deterministicShare !== null && m.deterministicShare < 0.6;
  const ceilingClose = m.judgeCeiling > 0 && m.judgeToday / m.judgeCeiling > 0.8;

  return (
    <section className="mb-8">
      <h2 className="font-display text-[20px] tracking-tight">Where we actually are</h2>
      <p className="mt-1 text-[12.5px] text-ink-mid">
        Unit economics live on this screen and nowhere else (D-018).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Audits · 30d" v={String(m.audits.month)} note={`${m.audits.week} this week · ${m.audits.today} today`} />
        <Stat k="Spend · 30d" v={usd(m.spend.month)} note={`${usd(m.spend.week)} week · ${usd(m.spend.today)} today`} />
        <Stat
          k="Cost per audit"
          v={m.costPerAudit === null ? '—' : usd(m.costPerAudit, 5)}
          note="the number pricing is set from"
        />
        <Stat
          k="Decided by code"
          v={pct(m.deterministicShare)}
          note={shareLow ? 'below 60% — cost per audit will be rising' : 'the margin depends on this staying high'}
          alarm={shareLow}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Active subscribers" v={String(m.subscribers.active)} note={`${m.subscribers.pastDue} past due · ${m.subscribers.cancelled} cancelled`} />
        <Stat
          k="Judged today"
          v={`${m.judgeToday} / ${m.judgeCeiling}`}
          note={ceilingClose ? 'past 80% of the daily ceiling' : 'global daily ceiling'}
          alarm={ceilingClose}
        />
        <Stat
          k="Audits that found something"
          v={`${m.auditsWithFindings} / ${m.audits.month}`}
          note="the product working, measured rather than assumed"
        />
        <Stat
          k="Caught nothing"
          v={String(Math.max(0, m.audits.month - m.auditsWithFindings))}
          note="not a failure — but if this is everything, the rules may not be checkable"
        />
      </div>
    </section>
  );
}
