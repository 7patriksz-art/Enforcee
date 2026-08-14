'use client';

import CopyLine from '@/components/CopyLine';
import { useState } from 'react';
import Link from 'next/link';

export default function Licence({ entitled }: { entitled: boolean }) {
  const [licence, setLicence] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/licence', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Could not issue a licence.');
      setLicence(json.licence as string);
      setExpires(json.expiresAt as string);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!entitled) {
    return (
      <section className="rounded-2xl border border-honey-line bg-honey-pale/50 px-5 py-5">
        <h2 className="font-display text-[20px] tracking-tight">No licence on this account yet</h2>
        <p className="readable mt-2 max-w-2xl">
          Auditing needs no licence and never will. The guard does.{' '}
          <span className="hi font-semibold text-ink">Auditing stays free and unlimited.</span>
        </p>
        {/* Said "Start the trial" until 2026-08-14. There is no trial — D-021, decided
            9 August, and one of the load-bearing honesty claims on the pricing page.
            Nobody noticed for five days because the button only renders for a signed-in
            user without a subscription, which is a state almost nothing exercises.

            The invariants test missed it too: it only read pricing/page.tsx and plans.ts.
            Widened to every page in the same commit — a decision enforced on one file is
            enforced nowhere. */}
        <Link
          href="/pricing"
          className="press mt-4 inline-block rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-ink-soft"
        >
          See what a licence costs
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border hairline bg-white px-5 py-5">
      <h2 className="font-display text-[20px] tracking-tight">Your licence</h2>
      <p className="readable mt-2 max-w-2xl">
        One line of signed text. It is checked on your own machine, offline, every time the guard compiles — we never
        find out that you ran it.
      </p>

      {!licence ? (
        <button
          onClick={issue}
          disabled={busy}
          className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? 'Signing…' : 'Issue a licence'}
        </button>
      ) : (
        <div className="mt-4">
          <div className="counter-theme overflow-x-auto rounded-xl bg-paper px-4 py-3">
            <code className="font-mono text-[11.5px] leading-relaxed text-paper break-all">{licence}</code>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(licence);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-ink/30"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            {expires && (
              <span className="font-mono text-[11px] text-skip">
                valid until {new Date(expires).toISOString().slice(0, 10)} · re-issue any time
              </span>
            )}
          </div>
          {/* This block used to read:
                mkdir -p ~/.enforcee
                pbpaste > ~/.enforcee/licence
              `pbpaste` is macOS only and `mkdir -p` is not a PowerShell command, so the
              first instruction a paying customer received worked on exactly one of the
              three platforms we test on. Replaced by a command the CLI implements, which
              also verifies the licence BEFORE writing it — so a mistyped paste says so
              instead of silently creating a file that later looks like an expired
              subscription. */}
          <p className="mt-4 text-[13px] leading-relaxed text-ink-mid">
            Then, once per machine — the same command on macOS, Linux and Windows:
          </p>
          <CopyLine
            className="mt-2"
            label="the licence install commands"
            code={'npx enforcee licence set <paste it here>\nnpx enforcee licence'}
          />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-fail-line bg-fail-pale px-4 py-3 text-[13px] text-fail">{error}</p>
      )}
    </section>
  );
}
