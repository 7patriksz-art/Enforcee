'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { PLANS, TRIAL_DAYS, yearlySaving, type Interval } from '@/lib/plans';

interface Row {
  label: string;
  /** What the row actually means, in enough detail that nobody has to guess. */
  detail: string;
  free: string | boolean;
  builder: string | boolean;
  founder: string | boolean;
}

const MATRIX: Row[] = [
  {
    label: 'Audits, on the web and in the CLI',
    detail:
      'An audit takes your ruleset and one thing an AI produced, and returns a verdict for every rule you wrote: followed, violated, not applicable, or honestly unverifiable. There is no per-audit charge, no credit balance and no counter on any plan, including Free. Run it a hundred times a day if you want. A tool that charges you for checking more carefully is a tool that quietly teaches you to check less.',
    free: 'Unlimited',
    builder: 'Unlimited',
    founder: 'Unlimited',
  },
  {
    label: 'CLI without an account, a key or a network call',
    detail:
      'npx enforcee audit CLAUDE.md answer.md works on a laptop with the wifi switched off. No signup, no API key, no telemetry, no update ping — there is nothing to turn off because there is nothing there. About four fifths of a real ruleset is settled by code rather than by a model, so the diagnostic half of this product genuinely does not need us. It is also how you check our claims: run the same input twice, on two machines, and you get a byte-identical receipt.',
    free: true,
    builder: true,
    founder: true,
  },
  {
    label: 'Evidence quotes and method badges',
    detail:
      'Every verdict says how it was reached. Deterministic means code proved it and you can reproduce it offline. Judged means a model decided — and it had to return a quote copied character-for-character out of your own text, which we then locate programmatically in the source. A judged verdict whose quote we cannot find is thrown away and downgraded to unverifiable rather than shown to you. You never have to wonder which verdicts are proofs and which are opinions, because we never blur the two.',
    free: true,
    builder: true,
    founder: true,
  },
  {
    label: 'Coverage — the rules that left no trace',
    detail:
      'Coverage is the share of applicable rules that left any observable sign in the output. A rule with no trace at all is marked "no signal" rather than quietly counted as passed. This is the number that stops "we could not tell" from disguising itself as "it passed", and it is the single most useful figure on a receipt.',
    free: true,
    builder: true,
    founder: true,
  },
  {
    label: 'Ruleset health',
    detail:
      'Critiques your rules rather than the output: near-duplicates that are the same rule written twice, pairs that contradict each other so one must always fail, and rules too vague for anything to ever check. Most rulesets that people say "stopped working" were never checkable to begin with, and this is the fastest way to find that out.',
    free: true,
    builder: true,
    founder: true,
  },
  {
    label: 'Rules found in your conversation',
    detail:
      'Reads a conversation and proposes rules from things you already said — corrections, "stop doing X", "I would rather Y". Every candidate carries the exact sentence that produced it, at a verified position, and arrives switched off; nothing is ever enabled on your behalf. Free shows the first three and tells you plainly how many more it found. Builder and Founder hand you all of them.',
    free: 'First 3',
    builder: 'Unlimited',
    founder: 'Unlimited',
  },
  {
    label: 'Receipts kept after you close the tab',
    detail:
      'On Free nothing is written to our database at all — your audit is processed, returned, and discarded. That is not a teaser, it is the actual behaviour, and you can download the JSON yourself if you want to keep one. On paid, every receipt is stored and searchable, so you can reopen last Tuesday’s audit and see whether the rule that broke then is still breaking now.',
    free: false,
    builder: 'Forever',
    founder: 'Forever',
  },
  {
    label: 'Per-rule track record over time',
    detail:
      'Rules are identified by a hash of their normalised text, so a rule keeps its identity even after you reword it, reorder it or move it to a different file. That is what makes a sentence like "this rule failed 6 of your last 40 audits" possible at all. It is the question that actually changes what you write in your ruleset, and no single audit can answer it.',
    free: false,
    builder: true,
    founder: true,
  },
  {
    label: 'Drift alerts when a rule starts failing',
    detail:
      'A rule that held for weeks and then starts failing is the signal worth paying for — it usually means the model changed underneath you, or your ruleset grew a contradiction you have not noticed. Silent degradation is the exact failure this product exists to catch, and you cannot spot it by looking at one audit at a time.',
    free: false,
    builder: true,
    founder: true,
  },
  {
    label: 'The guard — blocks a command before it runs',
    detail:
      'A hook that inspects a tool call before it executes and refuses the ones your rules forbid, handing the model your own rule text as the reason. Force-push denied, --force-with-lease allowed, rm -rf ./build warned, rm -rf / denied. This is the difference between finding out afterwards and it not happening. It runs on your machine, reads a policy in your own repo, and writes to a ledger you own — it never contacts us.',
    free: false,
    builder: true,
    founder: true,
  },
  {
    label: 'Nested and path-scoped rules restored after compaction',
    detail:
      'Read this one carefully, because most of it is free and we are not going to pretend otherwise. Claude Code already re-injects your project-root CLAUDE.md after /compact by itself — their docs say so plainly, and you should not pay anyone for that. What it does NOT do, in their words, is re-inject "nested CLAUDE.md files in subdirectories and rules with paths: frontmatter"; those come back only the next time Claude happens to read a matching file. In a monorepo that is most of your rules, and the gap is silent. The guard covers exactly that residue, and records that it did, so you can check rather than hope.',
    free: false,
    builder: true,
    founder: true,
  },
  {
    label: 'Retry-loop escalation',
    detail:
      'A blocked model frequently tries the same thing again under a fresh call id. The guard counts attempts per session and escalates the refusal: by the second attempt it is firmer, by the fourth it tells the model to stop and wait for you. Without this, one block can turn into a loop that burns tokens and patience and ends with somebody uninstalling the guard.',
    free: false,
    builder: true,
    founder: true,
  },
  {
    label: 'Judged layer on our key, not yours',
    detail:
      'The minority of rules that code cannot settle are adjudicated by a model. On Free you supply your own API key for that part, and the request is between you and the provider. On paid there is no key to obtain, manage, rotate or leak, and no second bill arriving from somewhere else.',
    free: false,
    builder: true,
    founder: true,
  },
  {
    label: 'Projects',
    detail:
      'A project is a codebase with its own ruleset and its own compiled policy, kept separate from your others so a rule that belongs to one repository does not start firing in another. Builder covers three, which is most people. Founder is unlimited.',
    free: '—',
    builder: '3',
    founder: 'Unlimited',
  },
  {
    label: 'CI gate — a violation fails the PR',
    detail:
      'The same check that runs on your laptop runs in your pipeline and exits non-zero when a rule is violated, so a pull request fails instead of merging. This is the point where a rule stops being your personal preference and becomes something the team is actually held to — which is a different product from a thing you run when you happen to remember.',
    free: false,
    builder: false,
    founder: true,
  },
  {
    label: 'Bypasses recorded with a reason',
    detail:
      'Sometimes a rule genuinely has to be overridden, and that is fine. What is not fine is nobody knowing it happened. An override is recorded with the reason attached, so the exception is visible in the record rather than invisible in somebody’s memory.',
    free: false,
    builder: false,
    founder: true,
  },
  {
    label: 'Signed receipts for a client',
    detail:
      'An exportable, tamper-evident record of what was checked and what the verdict was. A receipt carries a hash of the ruleset, a hash of the output and a hash of itself, so anyone can recompute it and prove it was not edited after the fact — including somebody who has no reason to trust you. That is what makes it usable as evidence rather than as a screenshot.',
    free: false,
    builder: false,
    founder: true,
  },
  {
    label: 'REST API',
    detail:
      'Run audits from your own systems instead of from our interface — a review bot, an internal dashboard, a nightly job over yesterday’s outputs. Same engine, same receipts, same verdicts, with your own credentials.',
    free: false,
    builder: false,
    founder: true,
  },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <span className="font-mono text-[13px] text-pass">✓</span>;
  if (v === false) return <span className="font-mono text-[13px] text-paper-line">—</span>;
  return <span className="text-[12.5px] text-ink-mid">{v}</span>;
}

/**
 * The explanation popover.
 *
 * Rendered fixed rather than absolute, because the table lives inside an overflow-x-auto
 * container that would otherwise clip it on narrow screens. It repositions on scroll
 * instead of closing, so a small nudge of the page does not dismiss what you were reading.
 */
function Explainer({
  anchor,
  row,
  onClose,
  onEnter,
  onLeave,
}: {
  anchor: HTMLElement;
  row: Row;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    const W = Math.min(360, window.innerWidth - 24);
    const H = boxRef.current?.offsetHeight ?? 200;
    let left = r.left - 8;
    if (left + W > window.innerWidth - 12) left = window.innerWidth - W - 12;
    if (left < 12) left = 12;
    const above = r.bottom + H + 12 > window.innerHeight && r.top - H - 12 > 0;
    setPos({ top: above ? r.top - H - 10 : r.bottom + 10, left, above });
  }, [anchor]);

  useEffect(() => {
    place();
    const onScroll = () => place();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [place, onClose, anchor]);

  return (
    <div
      ref={boxRef}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: Math.min(360, typeof window === 'undefined' ? 360 : window.innerWidth - 24),
        opacity: pos ? 1 : 0,
      }}
      className="z-50 rounded-xl border border-ink/12 bg-white px-4 py-3.5 shadow-lg shadow-ink/10"
    >
      <div className="text-[13.5px] font-semibold leading-snug">{row.label}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-mid">{row.detail}</p>
      <div className="mt-3 flex items-center gap-3 border-t hairline pt-2.5 font-mono text-[10px] uppercase tracking-wide">
        <Tick label="Free" v={row.free} />
        <Tick label="Builder" v={row.builder} />
        <Tick label="Founder" v={row.founder} />
      </div>
    </div>
  );
}

function Tick({ label, v }: { label: string; v: string | boolean }) {
  const on = v !== false;
  return (
    <span className={on ? 'text-ink' : 'text-paper-line'}>
      {label} {v === true ? '✓' : v === false ? '—' : String(v)}
    </span>
  );
}

function InfoDot({
  row,
  open,
  onHover,
  onPin,
  onLeave,
}: {
  row: Row;
  open: boolean;
  onHover: (el: HTMLElement, row: Row) => void;
  onPin: (el: HTMLElement, row: Row) => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`What "${row.label}" means`}
      aria-expanded={open}
      onClick={() => ref.current && onPin(ref.current, row)}
      onMouseEnter={() => ref.current && onHover(ref.current, row)}
      onMouseLeave={onLeave}
      onFocus={() => ref.current && onHover(ref.current, row)}
      className={clsx(
        'ml-1.5 inline-grid h-[15px] w-[15px] shrink-0 translate-y-[1.5px] place-items-center rounded-full border font-mono text-[9.5px] leading-none transition-colors',
        open
          ? 'border-ink bg-ink text-white'
          : 'border-ink/25 text-ink-light hover:border-ink/60 hover:text-ink'
      )}
    >
      i
    </button>
  );
}

export default function Pricing() {
  const [interval, setInterval] = useState<Interval>('yearly');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Hover previews; a click pins it open so you can select the text or read it on a phone.
  const [explain, setExplain] = useState<{ el: HTMLElement; row: Row; pinned: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    // Long enough to move the pointer from the dot into the box without losing it.
    closeTimer.current = setTimeout(() => setExplain((c) => (c?.pinned ? c : null)), 220);
  }, [cancelClose]);

  const onHover = useCallback(
    (el: HTMLElement, row: Row) => {
      cancelClose();
      setExplain((c) => (c?.pinned && c.row.label !== row.label ? c : { el, row, pinned: c?.pinned ?? false }));
    },
    [cancelClose]
  );

  const onPin = useCallback(
    (el: HTMLElement, row: Row) => {
      cancelClose();
      setExplain((c) => (c?.pinned && c.row.label === row.label ? null : { el, row, pinned: true }));
    },
    [cancelClose]
  );

  useEffect(() => () => cancelClose(), [cancelClose]);

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
          No asterisks. If a row says no, it means no — not &ldquo;limited&rdquo;. Every feature carries an{' '}
          <span className="inline-grid h-[15px] w-[15px] translate-y-[2px] place-items-center rounded-full border border-ink/25 font-mono text-[9.5px] leading-none text-ink-light">
            i
          </span>{' '}
          that says in full what it actually does, because a feature name you have to guess at is a feature name we
          chose for ourselves.
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
                <tr key={r.label} className={clsx(explain?.row.label === r.label && 'bg-honey-pale/25')}>
                  <td className="px-4 py-2.5">
                    <span className="align-middle">{r.label}</span>
                    <InfoDot
                      row={r}
                      open={explain?.row.label === r.label}
                      onHover={onHover}
                      onPin={onPin}
                      onLeave={scheduleClose}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center"><Cell v={r.free} /></td>
                  <td className="bg-honey-pale/20 px-4 py-2.5 text-center"><Cell v={r.builder} /></td>
                  <td className="px-4 py-2.5 text-center"><Cell v={r.founder} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {explain && (
        <Explainer
          key={explain.row.label}
          anchor={explain.el}
          row={explain.row}
          onClose={() => setExplain(null)}
          onEnter={cancelClose}
          onLeave={scheduleClose}
        />
      )}

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
