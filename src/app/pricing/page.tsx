'use client';

import { useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { PLANS, TRIAL_DAYS, yearlySaving, type Interval } from '@/lib/plans';

const MATRIX: { label: string; free: string | boolean; builder: string | boolean; founder: string | boolean }[] = [
  { label: 'Audits, on the web and in the CLI', free: 'Unlimited', builder: 'Unlimited', founder: 'Unlimited' },
  { label: 'CLI without an account, a key or a network call', free: true, builder: true, founder: true },
  { label: 'Evidence quotes and method badges', free: true, builder: true, founder: true },
  { label: 'Ruleset health', free: true, builder: true, founder: true },
  { label: 'Rules found in your conversation', free: 'First 3', builder: 'Unlimited', founder: 'Unlimited' },
  { label: 'Receipts kept after you close the tab', free: false, builder: 'Forever', founder: 'Forever' },
  { label: 'Per-rule track record over time', free: false, builder: true, founder: true },
  { label: 'Drift alerts when a rule starts failing', free: false, builder: true, founder: true },
  { label: 'The guard — blocks a command before it runs', free: false, builder: true, founder: true },
  { label: 'Rules restored after context compaction', free: false, builder: true, founder: true },
  { label: 'Retry-loop escalation', free: false, builder: true, founder: true },
  { label: 'Judged layer on our key, not yours', free: false, builder: true, founder: true },
  { label: 'Projects', free: '—', builder: '3', founder: 'Unlimited' },
  { label: 'CI gate — a violation fails the PR', free: false, builder: false, founder: true },
  { label: 'Bypasses recorded with a reason', free: false, builder: false, founder: true },
  { label: 'Signed receipts for a client', free: false, builder: false, founder: true },
  { label: 'REST API', free: false, builder: false, founder: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span className="font-mono text-[13px] text-pass">✓</span>;
  if (v === false) return <span className="font-mono text-[13px] text-paper-line">—</span>;
  return <span className="text-[12.5px] text-ink-mid">{v}</span>;
}

export default function Pricing() {
  const [interval, setInterval] = useState<Interval>('yearly');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(plan: 'builder' | 'founder') {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Could not start checkout.');
      window.location.href = json.url as string;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">pricing</p>
      <h1 className="mt-4 max-w-[24ch] font-display text-[38px] leading-[1.1] tracking-tight">
        Free shows you the problem. Paid makes it stop.
      </h1>
      <p className="readable mt-5 max-w-prose">
        Auditing is free forever and always will be — it is how you find out whether any of this is true.{' '}
        <span className="hi font-semibold text-ink">
          But an audit is a diagnosis. The guard is the treatment.
        </span>{' '}
        Thirty days of the real thing, no card, cancel from a link in the first email.
      </p>

      <div className="mt-9 inline-flex items-center gap-1 rounded-xl border hairline bg-white p-1">
        {(['monthly', 'yearly'] as Interval[]).map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            className={clsx(
              'rounded-lg px-4 py-2 text-[13.5px] font-medium transition-colors',
              interval === iv ? 'bg-ink text-white' : 'text-ink-mid hover:text-ink'
            )}
          >
            {iv === 'monthly' ? 'Monthly' : 'Yearly'}
            {iv === 'yearly' && (
              <span className={clsx('ml-2 font-mono text-[10.5px]', interval === 'yearly' ? 'text-honey-line' : 'text-clay')}>
                2 months free
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const saving = yearlySaving(p);
          const price = p.price[interval];
          const was = p.wasPrice?.[interval];
          return (
            <div
              key={p.id}
              className={clsx(
                'flex flex-col rounded-2xl border px-6 py-6',
                p.featured ? 'border-ink bg-white shadow-sm ring-1 ring-ink/5' : 'hairline bg-white'
              )}
            >
              {p.featured && (
                <div className="mb-3 inline-flex w-fit rounded-full bg-honey-pale px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-honey">
                  most people land here
                </div>
              )}
              <div className="font-display text-[22px] tracking-tight">{p.name}</div>
              <p className="mt-1 text-[12.5px] leading-snug text-clay">{p.who}</p>

              <div className="mt-4 min-h-[70px]">
                <div className="flex items-baseline gap-2.5">
                  {was && (
                    <span className="font-mono text-[17px] leading-none text-ink-light line-through decoration-clay/60 decoration-2">
                      ${was}
                    </span>
                  )}
                  <span className="font-mono text-[38px] leading-none tracking-tight">${price}</span>
                  <span className="text-[13px] text-ink-mid">
                    {price === 0 ? 'forever' : interval === 'yearly' ? '/ year' : '/ month'}
                  </span>
                </div>
                {saving && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-clay-pale px-2 py-0.5 font-mono text-[11px] text-clay">
                      launch price
                    </span>
                    {interval === 'yearly' && (
                      <span className="font-mono text-[11.5px] text-ink-light">
                        ${saving.effectiveMonthly.toFixed(2)}/mo effective · saves ${saving.saved} against monthly
                      </span>
                    )}
                  </div>
                )}
              </div>

              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-mid">{p.pitch}</p>

              <ul className="mt-5 space-y-2 border-t hairline pt-5 text-[13.5px] leading-relaxed">
                {p.unlocks.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-[3px] font-mono text-[11px] text-pass">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {p.walls && (
                <div className="mt-4 rounded-xl border border-unknown-line bg-unknown-pale/50 px-3.5 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-wide text-unknown">what free does not do</div>
                  <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-mid">
                    {p.walls.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-auto pt-6">
                {p.id === 'free' ? (
                  <Link
                    href="/audit"
                    className="block rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-center text-[14px] font-medium hover:border-ink/30 transition-colors"
                  >
                    {p.cta}
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={() => checkout(p.id as 'builder' | 'founder')}
                      disabled={busy !== null}
                      className={clsx(
                        'w-full rounded-xl px-4 py-2.5 text-[14px] font-medium transition-colors disabled:opacity-50',
                        p.featured ? 'bg-ink text-white hover:bg-ink-soft' : 'border border-ink/15 bg-white hover:border-ink/30'
                      )}
                    >
                      {busy === p.id ? 'Opening checkout…' : p.cta}
                    </button>
                    <p className="mt-2 text-center font-mono text-[10.5px] text-skip">
                      no card for the trial · cancel any time
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-fail-line bg-fail-pale px-4 py-3 text-[13.5px] text-fail">{error}</p>
      )}

      {/* ── The matrix ─────────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="font-display text-[24px] tracking-tight">Exactly what you get</h2>
        <p className="readable mt-2 mb-6 max-w-prose">
          No asterisks. If a row says no, it means no — not &ldquo;limited&rdquo;.
        </p>
        <div className="overflow-x-auto rounded-2xl border hairline">
          <table className="w-full min-w-[620px] text-left text-[13.5px]">
            <thead>
              <tr className="bg-paper-soft text-[10.5px] uppercase tracking-wide text-skip">
                <th className="px-4 py-3 font-medium">&nbsp;</th>
                <th className="px-4 py-3 text-center font-medium">Free</th>
                <th className="bg-honey-pale/40 px-4 py-3 text-center font-medium text-honey">Builder</th>
                <th className="px-4 py-3 text-center font-medium">Founder</th>
              </tr>
            </thead>
            <tbody className="divide-y hairline bg-white">
              {MATRIX.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-2.5">{r.label}</td>
                  <td className="px-4 py-2.5 text-center"><Cell v={r.free} /></td>
                  <td className="bg-honey-pale/20 px-4 py-2.5 text-center"><Cell v={r.builder} /></td>
                  <td className="px-4 py-2.5 text-center"><Cell v={r.founder} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-honey-line bg-honey-pale/40 px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">What we will never charge for</h2>
        <ul className="readable mt-3 max-w-prose list-disc space-y-1.5 pl-5">
          <li><strong>Auditing.</strong> Unlimited, on Free, forever. It is how you check whether anything we claim is true, and putting that behind a wall would make every number on this site unverifiable.</li>
          <li><strong>Per-audit metering.</strong> No credits, no counter, no charge that grows with how carefully you check.</li>
          <li><strong>Your own data.</strong> Rulesets are markdown you own, the policy is JSON in your repo, the ledger is on your disk. Cancelling takes the history, not the work.</li>
        </ul>
      </section>

      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        {[
          {
            q: `What happens after ${TRIAL_DAYS} days?`,
            a: 'It stops. No card is taken up front, so nothing charges automatically — you either add one or you drop back to Free with your audits still working. We would rather lose the sale than take a payment somebody forgot about.',
          },
          {
            q: 'Why is auditing free but blocking is not?',
            a: 'An audit is a diagnosis you run when you already suspect something. The guard runs on every tool call, in every session, whether or not you are watching. One of those is a tool. The other is a system that has to be there when you are not.',
          },
          {
            q: 'Can I keep using it for free forever?',
            a: 'Yes, honestly. If manual auditing is all you need, take it and go with our blessing. Most people who audit twice come back wanting the thing that stops it happening again.',
          },
          {
            q: 'Do I need an API key?',
            a: 'On Free, yes, and only for the judged fifth — four fifths runs on your machine with no key at all. On Builder and Founder there is no key to manage, rotate or leak.',
          },
          {
            q: 'How is the paid CLI licensed if it never phones home?',
            a: 'Your licence is one signed line of text your own machine verifies offline. It works on a plane, it works in an air-gapped CI runner, and we never learn that you ran it. The auditing commands need no licence at all and never will.',
          },
        ].map((f) => (
          <div key={f.q} className="rounded-2xl border hairline bg-white px-5 py-4">
            <div className="text-[15px] font-semibold">{f.q}</div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">{f.a}</p>
          </div>
        ))}
      </section>

      <p className="mt-10 max-w-prose text-[12.5px] leading-relaxed text-skip">
        Prices in USD, excluding any tax that applies where you are. By subscribing you agree to the{' '}
        <Link href="/terms" className="text-brand hover:underline">terms</Link> and the{' '}
        <Link href="/privacy" className="text-brand hover:underline">privacy policy</Link>.
      </p>
    </main>
  );
}
