'use client';

import { useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { PLANS, yearlyAnchor, type Interval } from '@/lib/plans';

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
      <h1 className="mt-4 max-w-[22ch] font-display text-[38px] leading-[1.1] tracking-tight">
        The free tier is not a trial. It is the product.
      </h1>
      <p className="readable mt-5 max-w-prose">
        Four fifths of a real ruleset is settled by code — instantly, reproducibly, and without a model.
        That part is yours permanently.{' '}
        <span className="hi font-semibold text-ink">You pay when your rules stop being only yours.</span>
      </p>

      {/* Interval switch. Yearly is the default because it is the better deal and hiding
          that behind a click only costs the buyer money. */}
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
          const anchor = yearlyAnchor(p);
          const showYearly = interval === 'yearly' && anchor;
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

              <div className="mt-4 min-h-[74px]">
                {p.price.monthly === 0 ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[38px] leading-none tracking-tight">$0</span>
                      <span className="text-[13px] text-ink-mid">forever, no account</span>
                    </div>
                  </>
                ) : showYearly ? (
                  <>
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-mono text-[16px] leading-none text-ink-light line-through decoration-clay/60 decoration-2">
                        ${anchor!.was}
                      </span>
                      <span className="font-mono text-[38px] leading-none tracking-tight">${p.price.yearly}</span>
                      <span className="text-[13px] text-ink-mid">/ year</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-pass-pale px-2 py-0.5 font-mono text-[11px] text-pass">
                        save ${anchor!.saved}
                      </span>
                      <span className="font-mono text-[11.5px] text-ink-light">
                        ${anchor!.effectiveMonthly.toFixed(2)}/mo effective
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[38px] leading-none tracking-tight">${p.price.monthly}</span>
                      <span className="text-[13px] text-ink-mid">/ month</span>
                    </div>
                    <div className="mt-2 font-mono text-[11.5px] text-ink-light">
                      ${p.price.yearly} a year saves you ${anchor!.saved}
                    </div>
                  </>
                )}
              </div>

              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-mid">{p.pitch}</p>

              <ul className="mt-5 space-y-2 border-t hairline pt-5 text-[13.5px] leading-relaxed">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-[3px] font-mono text-[11px] text-pass">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
                {p.limits?.map((l) => (
                  <li key={l} className="flex gap-2.5 text-ink-light">
                    <span className="mt-[3px] font-mono text-[11px]">–</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6">
                {p.id === 'free' ? (
                  <Link
                    href="/audit"
                    className="block rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-center text-[14px] font-medium hover:border-ink/30 transition-colors"
                  >
                    {p.cta}
                  </Link>
                ) : (
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-fail-line bg-fail-pale px-4 py-3 text-[13.5px] text-fail">{error}</p>
      )}

      <section className="mt-14 rounded-2xl border border-honey-line bg-honey-pale/40 px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">What we will never charge for</h2>
        <ul className="readable mt-3 max-w-prose list-disc space-y-1.5 pl-5">
          <li><strong>Audits, rules, spans or scores.</strong> A meter would punish the person checking the most rules, who is exactly the person getting the most out of this.</li>
          <li><strong>The hook generator.</strong> Claude Code hooks are native and free. Charging for a file you could write yourself is not a business.</li>
          <li><strong>Running it locally.</strong> The CLI makes zero network calls by default and always will. There is no phone-home to switch off, because there is nothing to switch off.</li>
        </ul>
      </section>

      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        {[
          {
            q: 'Why is the free tier so complete?',
            a: 'Because giving away the part that runs without a model is the proof of the claim. If we hid it behind a wall you would have no reason to believe anything we say about the rest.',
          },
          {
            q: 'What exactly triggers the paywall?',
            a: 'Continuity and reach. Free answers "did my rules get followed, right now, on my machine." You pay when you want that answered while you sleep, kept forever, or applied to work that other people commit to.',
          },
          {
            q: 'Can I cancel and keep what I built?',
            a: 'Yes. Your rulesets are markdown files you own, the policy is JSON in your repo, and the ledger is on your disk. Cancelling takes away the history and the hosted judge, not your work.',
          },
          {
            q: 'Do I need an API key?',
            a: 'Only on Free, and only for the judged fifth. Builder and Founder run it on our side so there is no key to manage, rotate or leak.',
          },
        ].map((f) => (
          <div key={f.q} className="rounded-2xl border hairline bg-white px-5 py-4">
            <div className="text-[15px] font-semibold">{f.q}</div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">{f.a}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
