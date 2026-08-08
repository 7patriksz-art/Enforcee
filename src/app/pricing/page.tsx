'use client';

import { useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { PLANS } from '@/lib/plans';

export default function Pricing() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(plan: 'solo' | 'team') {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
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
        About 80% of a real ruleset is decided by code, and code costs us nothing to run — so we give that away
        permanently. <span className="hi font-semibold text-ink">You pay when your rules stop being only yours.</span>
      </p>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => (
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
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-mono text-[36px] leading-none tracking-tight">{p.price}</span>
              <span className="text-[13px] text-ink-mid">{p.cadence}</span>
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

            <div className="mt-6 pt-2">
              {p.id === 'free' ? (
                <Link
                  href="/audit"
                  className="block rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-center text-[14px] font-medium hover:border-ink/30 transition-colors"
                >
                  {p.cta}
                </Link>
              ) : (
                <button
                  onClick={() => checkout(p.id as 'solo' | 'team')}
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
        ))}
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-fail-line bg-fail-pale px-4 py-3 text-[13.5px] text-fail">{error}</p>
      )}

      <section className="mt-14 rounded-2xl border border-honey-line bg-honey-pale/40 px-6 py-6">
        <h2 className="font-display text-[22px] tracking-tight">What we will never charge for</h2>
        <ul className="readable mt-3 max-w-prose list-disc space-y-1.5 pl-5">
          <li><strong>Audits, rules, spans or scores.</strong> Metering rules punishes your most thorough user, who is your best user.</li>
          <li><strong>The hook generator.</strong> Claude Code hooks are native and free. Charging for a file you could write yourself is not a business.</li>
          <li><strong>Running it locally.</strong> The CLI makes zero network calls by default and always will.</li>
        </ul>
      </section>

      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        {[
          {
            q: 'Why is the free tier so complete?',
            a: 'Because the deterministic engine costs us nothing to run, and giving it away is the proof of the claim. If we hid the free 80% behind a wall you would have no reason to believe our numbers about the other 20%.',
          },
          {
            q: 'What exactly triggers the paywall?',
            a: 'The moment your ruleset becomes binding on somebody other than you: a hook you generated blocks a colleague’s command, a CI gate fails someone else’s pull request. That boundary is enforced by the org chart, not by our code.',
          },
          {
            q: 'Can I self-host it?',
            a: 'The engine and the guard run entirely on your machine already. There is no phone-home to disable, because there is nothing to disable.',
          },
          {
            q: 'What does an audit actually cost you?',
            a: 'Six-tenths of a cent, measured, for a ten-rule audit with the judge on. We publish it because we would rather you check our arithmetic than guess at our margin.',
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
