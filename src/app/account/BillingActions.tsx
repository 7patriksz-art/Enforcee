'use client';

import { useState } from 'react';

/**
 * One button to Stripe's Billing Portal, in place of "email us to cancel".
 *
 * Cancelling, changing a card and downloading invoices are three things a customer will
 * eventually need and none of them should route through a person. Stripe hosts all three,
 * on Stripe's domain, against Stripe's own record — so there is no cancellation flow of
 * ours that could be accused of being deliberately awkward, which is the most common
 * complaint about subscription products and the one we can least afford.
 *
 * Deliberately a secondary button. Leaving should be easy to find and not shouted about;
 * a solid red "Cancel subscription" is its own kind of pressure.
 */
export default function BillingActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/portal', { method: 'POST' });
      const json = (await res.json()) as { url?: string; error?: string; signInUrl?: string };
      if (json.signInUrl) return void (window.location.href = json.signInUrl);
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Could not open billing.');
      window.location.href = json.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={open}
        disabled={busy}
        className="press rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-[13.5px] font-medium hover:border-ink/35 disabled:opacity-50"
      >
        {busy ? 'Opening Stripe…' : 'Manage or cancel'}
      </button>
      <p className="mt-2 text-[12.5px] text-ink-mid">
        Invoices, card and cancellation, on Stripe. We never see your card.
      </p>
      {error && <p className="mt-2 text-[12.5px] font-medium text-fail">{error}</p>}
    </div>
  );
}
