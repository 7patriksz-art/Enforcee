'use client';

import { useState } from 'react';

/**
 * Export and delete, as buttons.
 *
 * Both used to be a `mailto:` — "email us and it is done the same day". Two things wrong
 * with that, and the second is the one that matters. It puts a personal address on the
 * highest-friction screen in the product, which reads as a one-person operation rather
 * than a company. And a same-day promise from an inbox is not a mechanism: the reader has
 * no way to know it will be honoured, which is the exact doubt this page exists to remove.
 *
 * ── Why the styling is quiet ────────────────────────────────────────────────
 *
 * Neither is a solid button. Export is a bordered secondary; delete is a text-weight
 * control that only becomes a real button once you have confirmed. A red button sitting
 * permanently on the page is both an invitation and a source of low-grade anxiety, and
 * destructive actions read as MORE trustworthy when they are understated — the confidence
 * is in the fact that it works, not in how loud it is.
 *
 * ── Typing the address ──────────────────────────────────────────────────────
 *
 * The same pattern GitHub and Stripe use, for the same reason: a modal gets clicked, an
 * address gets typed. The server checks it again — this field is a UX affordance, never
 * the security boundary.
 */
export default function DataActions({ email }: { email: string }) {
  const [arming, setArming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<null | 'export' | 'delete'>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function exportData() {
    setBusy('export');
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'Export failed.');
      // Streamed to a file rather than rendered. An account's whole history in a browser
      // tab is a screenshot waiting to happen.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enforcee-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNote('Downloaded. A copy of this notice is in your inbox.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      const json = (await res.json()) as { error?: string; subscriptionsCancelled?: number };
      if (!res.ok) throw new Error(json.error ?? 'Deletion failed.');
      window.location.href = json.subscriptionsCancelled ? '/?deleted=1&cancelled=1' : '/?deleted=1';
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border hairline bg-white px-5 py-5">
        <div className="text-[14px] font-semibold">Export</div>
        <p className="readable mt-1.5 text-[13px]">Everything held against your account, as a file.</p>
        <button
          onClick={exportData}
          disabled={busy !== null}
          className="press mt-3.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-[13.5px] font-medium hover:border-ink/35 disabled:opacity-50"
        >
          {busy === 'export' ? 'Preparing…' : 'Download my data'}
        </button>
        {note && <p className="mt-2.5 text-[12.5px] text-pass">{note}</p>}
      </section>

      <section className="rounded-2xl border border-fail-line bg-fail-pale px-5 py-5">
        <div className="text-[14px] font-semibold text-ink">Delete account</div>
        <p className="readable mt-1.5 text-[13px]">
          Cancels any subscription, then removes your account and stored receipts. Auditing keeps working.
        </p>

        {!arming ? (
          <button
            onClick={() => setArming(true)}
            className="press mt-3.5 rounded-xl border border-fail-line bg-white px-4 py-2 text-[13.5px] font-medium text-fail hover:border-fail"
          >
            Delete my account
          </button>
        ) : (
          <div className="mt-4">
            <label htmlFor="confirm-delete" className="block text-[12.5px] text-ink-mid">
              Type <span className="num text-ink">{email}</span> to confirm.
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                id="confirm-delete"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 font-mono text-[13px] outline-none"
              />
              <button
                onClick={deleteAccount}
                disabled={!matches || busy !== null}
                className="press rounded-xl bg-fail px-4 py-2 text-[13.5px] font-medium text-white disabled:opacity-40"
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                onClick={() => {
                  setArming(false);
                  setTyped('');
                  setError(null);
                }}
                className="press rounded-xl px-3 py-2 text-[13.5px] text-ink-mid hover:text-ink"
              >
                Cancel
              </button>
            </div>
            {/* Was: "this does not cancel a paid plan". Deleting a login while the card
                keeps being charged is indistinguishable from a scam however clearly it is
                disclosed, so the behaviour changed rather than the warning. */}
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mid">
              Any active subscription is cancelled first. If that fails, nothing is deleted.
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-[12.5px] font-medium text-fail">{error}</p>}
      </section>
    </div>
  );
}
